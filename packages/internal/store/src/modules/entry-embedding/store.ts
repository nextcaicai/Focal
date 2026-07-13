import { entryEmbeddingService } from "@follow/database/services/entry-embedding"
import type { EntryEmbeddingRecord } from "@follow/shared/entry-embedding"

import { embeddingBatchGenerator, embeddingGenerator } from "../../context"
import { recordHydrateStoreDetail } from "../../hydrate-perf"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { getEntry } from "../entry/getter"
import { entryActions } from "../entry/store"
import { entryRankScoreSyncService } from "../entry-rank-score/store"
import {
  buildEmbeddingSourceText,
  hasEmbeddingEligibleText,
  hashEmbeddingSourceText,
  isEmbeddingCurrentForEntry,
} from "./source-text"

interface EntryEmbeddingState {
  data: Record<string, EntryEmbeddingRecord>
  hydrated: boolean
}

const defaultState: EntryEmbeddingState = {
  data: {},
  hydrated: false,
}

export const useEntryEmbeddingStore = createZustandStore<EntryEmbeddingState>("entry-embedding")(
  () => defaultState,
)

const get = useEntryEmbeddingStore.getState
const set = useEntryEmbeddingStore.setState
const immerSet = createImmerSetter(useEntryEmbeddingStore)

class EntryEmbeddingActions implements Hydratable, Resetable {
  async hydrate() {
    const sqliteStart = performance.now()
    const records = await entryEmbeddingService.getAllEmbeddings()
    const sqliteMs = performance.now() - sqliteStart

    const immerStart = performance.now()
    immerSet((state) => {
      records.forEach((record) => {
        state.data[record.entryId] = record.data
      })
      state.hydrated = true
    })
    const immerMs = performance.now() - immerStart

    recordHydrateStoreDetail("entryEmbedding", {
      count: records.length,
      sqliteMs,
      immerMs,
    })
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set({ data: {}, hydrated: true })
    })
    tx.persist(() => entryEmbeddingService.reset())
    await tx.run()
  }

  isHydrated() {
    return get().hydrated
  }

  upsertManyInSession(records: Array<{ entryId: string; data: EntryEmbeddingRecord }>) {
    immerSet((state) => {
      records.forEach((record) => {
        state.data[record.entryId] = record.data
      })
    })
  }

  async upsertMany(records: Array<{ entryId: string; data: EntryEmbeddingRecord }>) {
    await entryEmbeddingService.upsertEmbeddings(
      records.map((record) => ({
        entryId: record.entryId,
        data: record.data,
      })),
    )

    this.upsertManyInSession(records)
  }

  getEmbedding(entryId: string) {
    return get().data[entryId]
  }

  deleteEmbeddingInSession(entryId: string) {
    immerSet((state) => {
      delete state.data[entryId]
    })
  }

  async deleteEmbedding(entryId: string) {
    this.deleteEmbeddingInSession(entryId)
    await entryEmbeddingService.deleteEmbedding(entryId)
  }
}

export const entryEmbeddingActions = new EntryEmbeddingActions()

type EmbeddingWorkItem = {
  entryId: string
  sourceText: string
  sourceHash: string
}

class EntryEmbeddingSyncService {
  private async prepareEmbeddingWork(
    entryId: string,
    options?: { force?: boolean },
  ): Promise<EmbeddingWorkItem | null> {
    let entry = getEntry(entryId)
    if (!entry) return null

    const existing = entryEmbeddingActions.getEmbedding(entryId)
    const sourceDeferred = entryActions.isEntryBodyDeferred(entryId)
    if (
      !options?.force &&
      existing &&
      isEmbeddingCurrentForEntry(entry, existing, { sourceDeferred })
    ) {
      return null
    }

    if (sourceDeferred) {
      entry = await entryActions.getEntryWithBodyLoaded(entryId)
      if (!entry) return null
    }

    if (!hasEmbeddingEligibleText(entry)) return null
    if (!options?.force && existing && isEmbeddingCurrentForEntry(entry, existing)) {
      return null
    }

    const sourceText = buildEmbeddingSourceText(entry)
    if (!sourceText) return null

    return {
      entryId,
      sourceText,
      sourceHash: hashEmbeddingSourceText(sourceText),
    }
  }

  private async persistEmbeddingResults(
    results: Array<{ entryId: string; record: EntryEmbeddingRecord }>,
  ) {
    if (results.length === 0) return

    await entryEmbeddingActions.upsertMany(
      results.map(({ entryId, record }) => ({ entryId, data: record })),
    )

    await entryRankScoreSyncService.recomputeForEntries(
      results.map(({ entryId }) => entryId),
      { force: true },
    )
  }

  async generateEmbedding({ entryId, force = false }: { entryId: string; force?: boolean }) {
    const work = await this.prepareEmbeddingWork(entryId, { force })
    if (!work) {
      const entry = getEntry(entryId)
      if (!entry) return null
      const existing = entryEmbeddingActions.getEmbedding(entryId)
      if (
        !force &&
        existing &&
        isEmbeddingCurrentForEntry(entry, existing, {
          sourceDeferred: entryActions.isEntryBodyDeferred(entryId),
        })
      ) {
        return existing
      }
      return null
    }

    const generator = embeddingGenerator()
    if (!generator) return null

    const generated = await generator({
      entryId: work.entryId,
      text: work.sourceText,
    })

    if (!generated) return null

    const record = {
      ...generated,
      sourceHash: work.sourceHash,
    }

    await this.persistEmbeddingResults([{ entryId: work.entryId, record }])
    return record
  }

  /**
   * Embed multiple entries in one provider API call when batch generator is available.
   * Returns entry ids that were successfully embedded.
   */
  async generateEmbeddingsBatch(
    entryIds: string[],
    options?: { force?: boolean },
  ): Promise<string[]> {
    if (entryIds.length === 0) return []

    const batchGenerator = embeddingBatchGenerator()
    if (!batchGenerator) {
      const succeeded: string[] = []
      for (const entryId of entryIds) {
        const record = await this.generateEmbedding({ entryId, force: options?.force })
        if (record) succeeded.push(entryId)
      }
      return succeeded
    }

    const workItems: EmbeddingWorkItem[] = []
    for (const entryId of entryIds) {
      const work = await this.prepareEmbeddingWork(entryId, options)
      if (work) workItems.push(work)
    }

    if (workItems.length === 0) return []

    const generated = await batchGenerator(
      workItems.map((work) => ({
        entryId: work.entryId,
        text: work.sourceText,
      })),
    )

    const persisted: Array<{ entryId: string; record: EntryEmbeddingRecord }> = []
    for (const [index, workItem] of workItems.entries()) {
      const work = workItem!
      const record = generated[index]
      if (!record) continue

      persisted.push({
        entryId: work.entryId,
        record: {
          ...record,
          sourceHash: work.sourceHash,
        },
      })
    }

    await this.persistEmbeddingResults(persisted)
    return persisted.map((item) => item.entryId)
  }
}

export const entryEmbeddingSyncService = new EntryEmbeddingSyncService()
