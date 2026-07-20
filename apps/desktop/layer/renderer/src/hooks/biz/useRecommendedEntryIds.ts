import { useBehaviorEventStore } from "@follow/store/behavior-event/store"
import { useCollectionStore } from "@follow/store/collection/store"
import { sortEntryIdsByRecommended } from "@follow/store/entry/sort"
import { useEntryQualityScoreStore } from "@follow/store/entry-quality-score/store"
import { useEntryRankScoreStore } from "@follow/store/entry-rank-score/store"
import { useCallback, useMemo } from "react"

const useRankRevision = (entryIds: readonly string[], enabled: boolean) =>
  useEntryRankScoreStore(
    useCallback(
      (state) => {
        if (!enabled) return ""

        return entryIds
          .map((entryId) => {
            const record = state.data[entryId]
            return record
              ? `${entryId}:${record.computed_at}:${record.components.base_score}`
              : `${entryId}:-`
          })
          .join("|")
      },
      [enabled, entryIds],
    ),
  )

const useQualityRevision = (entryIds: readonly string[], enabled: boolean) =>
  useEntryQualityScoreStore(
    useCallback(
      (state) => {
        if (!enabled) return ""

        return entryIds
          .map((entryId) => {
            const record = state.data[entryId]
            return record
              ? `${entryId}:${record.quality_score}:${record.confidence}`
              : `${entryId}:-`
          })
          .join("|")
      },
      [enabled, entryIds],
    ),
  )

const useBehaviorRevision = (entryIds: readonly string[], enabled: boolean) =>
  useBehaviorEventStore(
    useCallback(
      (state) => {
        if (!enabled) return ""

        const entryIdSet = new Set(entryIds)
        return state.events
          .filter((event) => entryIdSet.has(event.entryId))
          .map((event) => `${event.id}:${event.entryId}:${event.eventType}:${event.createdAt}`)
          .join("|")
      },
      [enabled, entryIds],
    ),
  )

const useCollectionRevision = (entryIds: readonly string[], enabled: boolean) =>
  useCollectionStore(
    useCallback(
      (state) => {
        if (!enabled) return ""

        return entryIds
          .map((entryId) => {
            const collection = state.collections[entryId]
            return collection ? `${entryId}:${collection.createdAt}` : `${entryId}:-`
          })
          .join("|")
      },
      [enabled, entryIds],
    ),
  )

export const useRecommendedEntryIds = (entryIds: string[], enabled: boolean) => {
  const rankRevision = useRankRevision(entryIds, enabled)
  const qualityRevision = useQualityRevision(entryIds, enabled)
  const behaviorRevision = useBehaviorRevision(entryIds, enabled)
  const collectionRevision = useCollectionRevision(entryIds, enabled)

  return useMemo(() => {
    if (!enabled) return entryIds

    void rankRevision
    void qualityRevision
    void behaviorRevision
    void collectionRevision

    return sortEntryIdsByRecommended(entryIds)
  }, [behaviorRevision, collectionRevision, enabled, entryIds, qualityRevision, rankRevision])
}
