import type { BehaviorEventType } from "@follow/shared/behavior-events"
import type { EntryTimelineSortMode } from "@follow/shared/entry-rank-score"
import {
  diversifyRecommendedEntryIdsByRules,
  filterRecommendedEntryIds,
  sortEntryIdsByRank,
} from "@follow/shared/entry-rank-score"

import { useBehaviorEventStore } from "../behavior-event/store"
import { getEntryCollections } from "../collection/getter"
import { entryQualityScoreActions } from "../entry-quality-score/store"
import { getEntryRankSortContext } from "../entry-rank-score/store"
import { useEntryStore } from "./store"

const getEntryFromStore = (entryId: string) => useEntryStore.getState().data[entryId]

const parseDate = (value: Date | string | null | undefined): Date | undefined => {
  if (!value) return
  if (value instanceof Date) return value

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return
  return date
}

const getLatestBehaviorEventAt = (
  entryId: string,
  eventType: BehaviorEventType,
): Date | undefined => {
  const { events } = useBehaviorEventStore.getState()

  for (const event of [...events].reverse()) {
    if (event?.entryId === entryId && event.eventType === eventType) {
      return parseDate(event.createdAt)
    }
  }
}

export function sortEntryIdsByPublishDate(a: string, b: string) {
  const entryA = getEntryFromStore(a)
  const entryB = getEntryFromStore(b)
  if (!entryA || !entryB) return 0
  return entryB.publishedAt.getTime() - entryA.publishedAt.getTime()
}

const getRecommendedEntryDiversityKey = (entryId: string) => {
  const entry = getEntryFromStore(entryId)
  if (!entry) return

  if (entry.feedId) return `feed:${entry.feedId}`
  if (entry.inboxHandle) return `inbox:${entry.inboxHandle}`
  if (entry.authorUrl) return `author:${entry.authorUrl}`
}

export function sortEntryIdsByRecommended(entryIds: string[], options?: { now?: Date }) {
  const context = getEntryRankSortContext()
  const recommendedEntryIds = filterRecommendedEntryIds({
    entryIds,
    now: options?.now,
    getPublishedAt: context.getPublishedAt,
    getInsertedAt: (entryId) => getEntryFromStore(entryId)?.insertedAt,
    getQualityRecord: (entryId) => entryQualityScoreActions.getScore(entryId),
    getEntryState: context.getEntryState,
    getReadCompletedAt: (entryId) => getLatestBehaviorEventAt(entryId, "read_complete"),
    getStarredAt: (entryId) => parseDate(getEntryCollections(entryId)?.createdAt),
    getNotInterestedAt: (entryId) => getLatestBehaviorEventAt(entryId, "not_interested"),
  })

  const sortedEntryIds = sortEntryIdsByRank({
    entryIds: recommendedEntryIds,
    getBaseRank: context.getBaseRank,
    getPublishedAt: context.getPublishedAt,
    getEntryState: context.getEntryState,
  })

  return diversifyRecommendedEntryIdsByRules({
    entryIds: sortedEntryIds,
    rules: [
      {
        getDiversityKey: (entryId) => {
          const rank = context.getBaseRank(entryId)
          const clusterId = rank?.components.matched_positive_cluster_id
          if (!clusterId || rank.components.interest_component <= 0) return

          return `interest:${clusterId}`
        },
      },
      {
        getDiversityKey: getRecommendedEntryDiversityKey,
      },
    ],
  })
}

export function sortEntryIds(entryIds: string[], mode: EntryTimelineSortMode) {
  if (mode === "recommended") {
    return sortEntryIdsByRecommended(entryIds)
  }

  return [...entryIds].sort(sortEntryIdsByPublishDate)
}
