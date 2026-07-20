import type { BehaviorEventType } from "@follow/shared/behavior-events"
import type { RecommendationDiagnostic } from "@follow/shared/entry-rank-score"
import { explainRecommendedEntryCandidate } from "@follow/shared/entry-rank-score"
import { useBehaviorEventStore } from "@follow/store/behavior-event/store"
import { useCollectionEntry, useIsEntryStarred } from "@follow/store/collection/hooks"
import { useEntry } from "@follow/store/entry/hooks"
import type { EntryModel } from "@follow/store/entry/types"
import { useEntryQualityScore } from "@follow/store/entry-quality-score/hooks"
import { useEntryRankScore } from "@follow/store/entry-rank-score/hooks"
import { useMemo } from "react"
import { useShallow } from "zustand/shallow"

const entrySelector = (entry: EntryModel) => ({
  insertedAt: entry.insertedAt,
  publishedAt: entry.publishedAt,
  read: entry.read,
})

const parseDate = (value: Date | string | null | undefined): Date | undefined => {
  if (!value) return
  if (value instanceof Date) return value

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return
  return date
}

const getLatestEventDate = (
  events: Array<{ eventType: BehaviorEventType; createdAt: string }>,
  eventType: BehaviorEventType,
) => {
  for (const event of [...events].reverse()) {
    if (event.eventType === eventType) {
      return parseDate(event.createdAt)
    }
  }
}

export const useEntryRecommendationDiagnostic = (
  entryId: string,
  enabled: boolean,
): RecommendationDiagnostic | null => {
  const entry = useEntry(entryId, entrySelector)
  const qualityRecord = useEntryQualityScore(entryId)
  const rank = useEntryRankScore(entryId)
  const starred = useIsEntryStarred(entryId)
  const starredAt = useCollectionEntry(entryId)?.createdAt
  const behaviorEvents = useBehaviorEventStore(
    useShallow((state) =>
      enabled
        ? state.events
            .filter((event) => event.entryId === entryId)
            .map((event) => ({
              createdAt: event.createdAt,
              eventType: event.eventType,
            }))
        : [],
    ),
  )

  return useMemo(() => {
    if (!enabled || !entry) return null

    return explainRecommendedEntryCandidate({
      entryId,
      entryIds: [entryId],
      getBaseRank: () => rank,
      getPublishedAt: () => entry.publishedAt,
      getInsertedAt: () => entry.insertedAt,
      getQualityRecord: () => qualityRecord,
      getEntryState: () => ({
        read: Boolean(entry.read),
        starred: Boolean(starred),
      }),
      feedbackEvents: behaviorEvents,
      getReadCompletedAt: () => getLatestEventDate(behaviorEvents, "read_complete"),
      getStarredAt: () => parseDate(starredAt),
      getNotInterestedAt: () => getLatestEventDate(behaviorEvents, "not_interested"),
    })
  }, [behaviorEvents, enabled, entry, entryId, qualityRecord, rank, starred, starredAt])
}
