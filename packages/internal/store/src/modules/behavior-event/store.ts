import { behaviorEventService } from "@follow/database/services/behavior-event"
import type { BehaviorEventMetadata, BehaviorEventType } from "@follow/shared/behavior-events"
import {
  getBehaviorEventPolarity,
  isBehaviorEventProfileSignal,
} from "@follow/shared/behavior-events"
import { INTEREST_CLUSTER_IDS, updateInterestCluster } from "@follow/shared/interest-profile"

import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import { entryEmbeddingActions, useEntryEmbeddingStore } from "../entry-embedding/store"
import { entryRankScoreSyncService } from "../entry-rank-score/store"
import { interestClusterActions } from "../interest-cluster/store"

interface BehaviorEventState {
  events: Array<{
    id: string
    entryId: string
    eventType: BehaviorEventType
    metadata?: BehaviorEventMetadata | null
    createdAt: string
  }>
}

export type BehaviorEvent = BehaviorEventState["events"][number]

export const removeBehaviorEvents = (
  events: readonly BehaviorEvent[],
  entryId: string,
  eventType: BehaviorEventType,
) => events.filter((event) => event.entryId !== entryId || event.eventType !== eventType)

const defaultState: BehaviorEventState = {
  events: [],
}

export const useBehaviorEventStore = createZustandStore<BehaviorEventState>("behavior-event")(
  () => defaultState,
)

const set = useBehaviorEventStore.setState
const immerSet = createImmerSetter(useBehaviorEventStore)

class BehaviorEventActions implements Hydratable, Resetable {
  async hydrate() {
    const records = await behaviorEventService.getAllEvents()
    immerSet((state) => {
      state.events = records.map((record) => ({
        id: record.id,
        entryId: record.entryId,
        eventType: record.eventType as BehaviorEventType,
        metadata: record.metadata ?? null,
        createdAt: record.createdAt,
      }))
    })
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })
    tx.persist(() => behaviorEventService.reset())
    await tx.run()
  }

  appendEventInSession(event: BehaviorEventState["events"][number]) {
    immerSet((state) => {
      state.events.push(event)
    })
  }

  removeEventsInSession(entryId: string, eventType: BehaviorEventType) {
    immerSet((state) => {
      state.events = removeBehaviorEvents(state.events, entryId, eventType)
    })
  }
}

export const behaviorEventActions = new BehaviorEventActions()

class BehaviorEventSyncService {
  private rankRecomputeTimer: ReturnType<typeof setTimeout> | null = null

  async record(
    entryId: string,
    eventType: BehaviorEventType,
    metadata?: BehaviorEventMetadata | null,
  ) {
    const id = `${entryId}-${eventType}-${Date.now()}`
    const createdAt = new Date().toISOString()
    const normalizedMetadata = metadata ?? null

    await behaviorEventService.insertEvent({
      id,
      entryId,
      eventType,
      metadata: normalizedMetadata,
      createdAt,
    })

    behaviorEventActions.appendEventInSession({
      id,
      entryId,
      eventType,
      metadata: normalizedMetadata,
      createdAt,
    })

    const embedding = entryEmbeddingActions.getEmbedding(entryId)
    if (
      embedding?.vector &&
      embedding.vector.length > 0 &&
      isBehaviorEventProfileSignal(eventType)
    ) {
      await this.updateInterestProfile(embedding.vector, eventType)
      this.scheduleRankRecompute()
    }

    if (shouldRecomputeEntryRank(eventType)) {
      await entryRankScoreSyncService.recomputeForEntry(entryId, { force: true })
    }
  }

  private scheduleRankRecompute() {
    if (this.rankRecomputeTimer) {
      clearTimeout(this.rankRecomputeTimer)
    }

    this.rankRecomputeTimer = setTimeout(() => {
      this.rankRecomputeTimer = null
      const entryIds = Object.keys(useEntryEmbeddingStore.getState().data)
      if (entryIds.length === 0) return

      void entryRankScoreSyncService.recomputeForEntries(entryIds, { force: true })
    }, 500)
  }

  private async updateInterestProfile(vector: number[], eventType: BehaviorEventType) {
    const polarity = getBehaviorEventPolarity(eventType)
    const clusterId =
      polarity === "positive" ? INTEREST_CLUSTER_IDS.positive : INTEREST_CLUSTER_IDS.negative
    const existing = interestClusterActions.getCluster(clusterId) ?? null
    const updated = updateInterestCluster({
      cluster: existing,
      vector,
      eventType,
    })

    await interestClusterActions.upsertMany([{ id: clusterId, data: updated }])
  }

  recordOpen(entryId: string, metadata?: BehaviorEventMetadata) {
    if (!shouldRecordOpenEvent(useBehaviorEventStore.getState().events, entryId)) {
      return Promise.resolve()
    }

    return this.record(entryId, "open", metadata)
  }

  recordMarkRead(entryId: string, metadata?: BehaviorEventMetadata) {
    return this.record(entryId, "mark_read", metadata)
  }

  recordReadProgress(
    entryId: string,
    progress: number,
    metadata?: Omit<BehaviorEventMetadata, "progress">,
  ) {
    const progressTier = readProgressTier(progress)
    if (progressTier === null || hasRecordedReadProgressTier(entryId, progressTier)) {
      return Promise.resolve()
    }

    return this.record(entryId, "read_progress", {
      ...metadata,
      progress: progressTier,
    })
  }

  recordFavorite(entryId: string, metadata?: BehaviorEventMetadata) {
    return this.record(entryId, "favorite", metadata)
  }

  recordReadComplete(entryId: string, metadata?: BehaviorEventMetadata) {
    if (hasRecordedBehaviorEvent(entryId, "read_complete")) {
      return Promise.resolve()
    }

    return this.record(entryId, "read_complete", metadata)
  }

  recordReadLater(entryId: string, metadata?: BehaviorEventMetadata) {
    if (hasRecordedBehaviorEvent(entryId, "read_later")) {
      return Promise.resolve()
    }

    return this.record(entryId, "read_later", metadata)
  }

  recordHide(entryId: string, metadata?: BehaviorEventMetadata) {
    return this.record(entryId, "hide", metadata)
  }

  recordNotInterested(entryId: string, metadata?: BehaviorEventMetadata) {
    return this.record(entryId, "not_interested", metadata)
  }

  recordQuickBounce(entryId: string, metadata?: BehaviorEventMetadata) {
    return this.record(entryId, "quick_bounce", metadata)
  }

  async remove(entryId: string, eventType: BehaviorEventType) {
    await behaviorEventService.deleteEventsByEntryIdAndType(entryId, eventType)
    behaviorEventActions.removeEventsInSession(entryId, eventType)
    await entryRankScoreSyncService.recomputeForEntry(entryId, { force: true })
  }

  removeNotInterested(entryId: string) {
    return this.remove(entryId, "not_interested")
  }

  removeReadLater(entryId: string) {
    return this.remove(entryId, "read_later")
  }
}

export const behaviorEventSyncService = new BehaviorEventSyncService()

const READ_PROGRESS_TIERS = [0.25, 0.5, 0.75] as const
const OPEN_DEDUPE_WINDOW_MS = 5 * 60 * 1000

type ReadProgressTier = (typeof READ_PROGRESS_TIERS)[number]

export function readProgressTier(progress: number): ReadProgressTier | null {
  const normalized = Math.max(0, Math.min(1, progress))

  for (const tier of [...READ_PROGRESS_TIERS].reverse()) {
    if (normalized >= tier) return tier
  }

  return null
}

function hasRecordedReadProgressTier(entryId: string, tier: ReadProgressTier): boolean {
  const { events } = useBehaviorEventStore.getState()

  return events.some((event) => {
    if (event.entryId !== entryId || event.eventType !== "read_progress") return false

    const progress = event.metadata?.progress
    return typeof progress === "number" && progress >= tier
  })
}

function hasRecordedBehaviorEvent(entryId: string, eventType: BehaviorEventType): boolean {
  return useBehaviorEventStore
    .getState()
    .events.some((event) => event.entryId === entryId && event.eventType === eventType)
}

function shouldRecomputeEntryRank(eventType: BehaviorEventType): boolean {
  return eventType !== "open"
}

export function shouldRecordOpenEvent(
  events: readonly BehaviorEvent[],
  entryId: string,
  now = new Date(),
): boolean {
  return !events.some((event) => {
    if (event.entryId !== entryId || event.eventType !== "open") return false

    const createdAt = new Date(event.createdAt).getTime()
    if (Number.isNaN(createdAt)) return false

    const elapsedMs = now.getTime() - createdAt
    return elapsedMs >= 0 && elapsedMs < OPEN_DEDUPE_WINDOW_MS
  })
}
