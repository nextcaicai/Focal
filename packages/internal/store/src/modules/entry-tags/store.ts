import { entryAiTagsService } from "@follow/database/services/entry-ai-tags"
import type {
  EntryAiTagAssignment,
  EntryContentTypeAssignment,
  EntryDomainAssignment,
} from "@follow/shared/entry-ai-tags"
import {
  DEFAULT_ENTRY_CONTENT_TYPE,
  DEFAULT_ENTRY_DOMAIN,
  ENTRY_TAXONOMY_VERSION,
  LEGACY_ENTRY_AI_TAG_MAP,
} from "@follow/shared/entry-ai-tags"
import type { SupportedActionLanguage } from "@follow/shared/language"

import { tagGenerator } from "../../context"
import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { getEntry } from "../entry/getter"
import { summaryActions } from "../summary/store"
import {
  inferDomainFromTags,
  resolveTopicLabel,
  tagsNeedTaxonomyUpgrade,
  validateContentType,
  validateDomain,
  validateTagAssignments,
} from "./utils"

interface EntryAiTagsState {
  data: Record<string, EntryAiTagAssignment[]>
  sourceData: Record<string, StoredEntryAiTagAssignment[]>
  contentType: Record<string, EntryContentTypeAssignment>
  domain: Record<string, EntryDomainAssignment>
  taxonomyVersion: Record<string, number>
}

type StoredEntryAiTagAssignment = Omit<EntryAiTagAssignment, "label"> & { label: string }

const defaultState: EntryAiTagsState = {
  data: {},
  sourceData: {},
  contentType: {},
  domain: {},
  taxonomyVersion: {},
}

type UpsertTagsRecord = {
  entryId: string
  tags: EntryAiTagAssignment[]
  contentType?: EntryContentTypeAssignment | null
  domain?: EntryDomainAssignment | null
  taxonomyVersion?: number | null
}

export const useEntryAiTagsStore = createZustandStore<EntryAiTagsState>("entry-ai-tags")(
  () => defaultState,
)

const get = useEntryAiTagsStore.getState
const set = useEntryAiTagsStore.setState
const immerSet = createImmerSetter(useEntryAiTagsStore)

/** Map legacy labels in-memory so topic filters work before re-enrichment. */
const normalizeStoredTags = (tags: StoredEntryAiTagAssignment[]): EntryAiTagAssignment[] => {
  const seen = new Set<string>()
  const next: EntryAiTagAssignment[] = []
  for (const tag of tags) {
    const label = resolveTopicLabel(tag.label)
    if (!label || seen.has(label)) continue
    seen.add(label)
    next.push({ ...tag, label })
  }
  return next
}

class EntryAiTagsActions implements Hydratable, Resetable {
  async hydrate() {
    const records = await entryAiTagsService.getAllTags()
    immerSet((state) => {
      records.forEach((record) => {
        const sourceTags = record.tags as StoredEntryAiTagAssignment[]
        state.sourceData[record.entryId] = sourceTags
        state.data[record.entryId] = normalizeStoredTags(sourceTags)
        if (record.contentType) {
          state.contentType[record.entryId] = {
            label: record.contentType,
            confidence: record.contentTypeConfidence ?? 0,
          }
        } else if ((record.tags as Array<{ label: string }>).some((tag) => tag.label === "论文")) {
          // Pre-v1 used 论文 as a topic tag; promote to genre on hydrate.
          state.contentType[record.entryId] = { label: "论文", confidence: 0.6 }
        }
        if (record.domain) {
          state.domain[record.entryId] = {
            label: record.domain,
            confidence: record.domainConfidence ?? 0,
          }
        } else {
          const inferred = inferDomainFromTags(record.tags)
          if (inferred) {
            state.domain[record.entryId] = inferred
          }
        }
        if (record.taxonomyVersion != null) {
          state.taxonomyVersion[record.entryId] = record.taxonomyVersion
        }
      })
    })
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })
    tx.persist(() => entryAiTagsService.reset())
    await tx.run()
  }

  upsertManyInSession(records: UpsertTagsRecord[]) {
    immerSet((state) => {
      records.forEach((record) => {
        state.data[record.entryId] = record.tags
        state.sourceData[record.entryId] = record.tags
        if (record.contentType) {
          state.contentType[record.entryId] = record.contentType
        }
        if (record.domain) {
          state.domain[record.entryId] = record.domain
        }
        if (record.taxonomyVersion != null) {
          state.taxonomyVersion[record.entryId] = record.taxonomyVersion
        }
      })
    })
  }

  async upsertMany(records: UpsertTagsRecord[]) {
    await Promise.all(
      records.map((record) =>
        entryAiTagsService.upsertTags({
          entryId: record.entryId,
          tags: record.tags,
          contentType: record.contentType?.label ?? null,
          contentTypeConfidence: record.contentType?.confidence ?? null,
          domain: record.domain?.label ?? null,
          domainConfidence: record.domain?.confidence ?? null,
          taxonomyVersion: record.taxonomyVersion ?? ENTRY_TAXONOMY_VERSION,
        }),
      ),
    )

    this.upsertManyInSession(records)
  }

  getTags(entryId: string) {
    return get().data[entryId]
  }

  getSourceTags(entryId: string) {
    return get().sourceData[entryId]
  }

  getContentType(entryId: string) {
    return get().contentType[entryId]
  }

  getDomain(entryId: string) {
    return get().domain[entryId]
  }

  getTaxonomyVersion(entryId: string) {
    return get().taxonomyVersion[entryId]
  }

  /**
   * True when the entry has no usable tag record yet (needs LLM),
   * or has pre-v1 data that can be upgraded offline.
   */
  needsTaxonomyWork(entryId: string) {
    const version = this.getTaxonomyVersion(entryId)
    if (version != null && version >= ENTRY_TAXONOMY_VERSION) {
      if (!this.getContentType(entryId)) return true
      if (!this.getDomain(entryId)) return true
      return tagsNeedTaxonomyUpgrade(this.getTags(entryId) ?? [], version, true)
    }

    // No version: either never tagged, or pre-v1 — both need work.
    return true
  }

  /** Never been tagged (or empty shell) → LLM path. */
  needsLlmTagging(entryId: string) {
    const sourceTags = this.getSourceTags(entryId)
    const contentType = this.getContentType(entryId)
    const domain = this.getDomain(entryId)
    // Raw source tags prove that a legacy payload existed even when every old
    // label is intentionally absent from the v1 topic axis.
    if ((sourceTags && sourceTags.length > 0) || contentType || domain) return false
    return true
  }
}

export const entryAiTagsActions = new EntryAiTagsActions()

/**
 * Offline upgrade: map legacy C labels, keep/fill A, infer B, stamp taxonomy v1.
 * No LLM tokens.
 */
const upgradeTaxonomyOffline = async (entryId: string) => {
  const rawTags = entryAiTagsActions.getSourceTags(entryId) ?? []
  const hasUnrecognizedLegacyTag = rawTags.some((tag) => {
    const rawLabel = tag.label.trim()
    return !resolveTopicLabel(rawLabel) && !(rawLabel in LEGACY_ENTRY_AI_TAG_MAP)
  })
  if (hasUnrecognizedLegacyTag) {
    // Preserve the database payload verbatim until an explicit mapping exists.
    return entryAiTagsActions.getTags(entryId) ?? []
  }

  // Hydration has already mapped and deduplicated known legacy labels. Keep
  // their stored confidence intact; the v1 threshold applies only to new LLM output.
  const tags = entryAiTagsActions.getTags(entryId) ?? []

  const contentType: EntryContentTypeAssignment = entryAiTagsActions.getContentType(entryId) ?? {
    label: DEFAULT_ENTRY_CONTENT_TYPE,
    confidence: 0.3,
  }

  const domain: EntryDomainAssignment = entryAiTagsActions.getDomain(entryId) ??
    inferDomainFromTags(rawTags) ??
    inferDomainFromTags(tags) ?? {
      label: DEFAULT_ENTRY_DOMAIN,
      confidence: 0.3,
    }

  await entryAiTagsActions.upsertMany([
    {
      entryId,
      tags,
      contentType,
      domain,
      taxonomyVersion: ENTRY_TAXONOMY_VERSION,
    },
  ])

  return tags
}

class EntryAiTagsSyncService {
  async generateTags({
    entryId,
    actionLanguage,
  }: {
    entryId: string
    actionLanguage: SupportedActionLanguage
  }) {
    if (!entryAiTagsActions.needsTaxonomyWork(entryId)) {
      return entryAiTagsActions.getTags(entryId) ?? []
    }

    // Pre-v1 or partial rows: upgrade without LLM to avoid mass token burn.
    if (!entryAiTagsActions.needsLlmTagging(entryId)) {
      return upgradeTaxonomyOffline(entryId)
    }

    const localTagGenerator = tagGenerator()
    if (!localTagGenerator) return null

    const entry = getEntry(entryId)
    if (!entry) return null

    const summary = summaryActions.getSummary(entryId, actionLanguage)?.summary ?? null
    const generated = await localTagGenerator({
      entryId,
      entry,
      actionLanguage,
      summary,
    })

    const tags = validateTagAssignments(generated)
    const contentType = validateContentType(generated.contentType) ?? {
      label: DEFAULT_ENTRY_CONTENT_TYPE,
      confidence: 0.3,
    }
    const domain = validateDomain(generated.domain) ??
      inferDomainFromTags(tags) ?? {
        label: DEFAULT_ENTRY_DOMAIN,
        confidence: 0.3,
      }

    // If model returned nothing useful on all axes, abort (will retry later).
    if (
      tags.length === 0 &&
      contentType.label === DEFAULT_ENTRY_CONTENT_TYPE &&
      domain.label === DEFAULT_ENTRY_DOMAIN
    ) {
      return null
    }

    await entryAiTagsActions.upsertMany([
      {
        entryId,
        tags,
        contentType,
        domain,
        taxonomyVersion: ENTRY_TAXONOMY_VERSION,
      },
    ])
    return tags
  }
}

export const entryAiTagsSyncService = new EntryAiTagsSyncService()
