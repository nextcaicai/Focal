import { entryActions, useEntryStore } from "@follow/store/entry/store"
import { entryQualityScoreActions } from "@follow/store/entry-quality-score/store"
import { useEntryAiTagsStore } from "@follow/store/entry-tags/store"
import { getCategoryFeedIds } from "@follow/store/subscription/getter"
import { useAtomValue } from "jotai"
import { useMemo } from "react"

import type { LibrarySearchScopeMode, LibrarySearchSort } from "~/atoms/library-search"
import { useLibrarySearchSession } from "~/atoms/library-search"
import { ROUTE_FEED_PENDING } from "~/constants"
import {
  getMyTopicIdFromFeedId,
  getSmartFeedScope,
  getTopicLabelFromFeedId,
} from "~/lib/timeline-scope"
import { matchEntryBySelector } from "~/modules/my-topics/selector"
import { myTopicsAtom } from "~/modules/my-topics/store"

import { scoreKeywordMatch, sortSearchHits } from "./rank"

const isSameLocalDay = (date: Date, offset: number) => {
  const target = new Date()
  target.setDate(target.getDate() + offset)
  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  )
}

export type SearchEntryIdsOptions = {
  query: string
  sort: LibrarySearchSort
  scopeMode: LibrarySearchScopeMode
  allowedFeedIds?: Set<string> | null
  smartFilter?: "today" | "yesterday" | "unread" | "starred" | null
  topicLabel?: string | null
  myTopicSelector?: Parameters<typeof matchEntryBySelector>[0] | null
  tagsByEntryId?: Record<string, Array<{ label: string }> | undefined>
  /** When smartFilter is starred, only these entry ids (collections) are eligible. */
  starredEntryIds?: Set<string> | null
}

/**
 * Scan in-memory entry store for keyword matches and return ranked ids.
 */
export function searchEntryIdsFromStore(options: SearchEntryIdsOptions): string[] {
  const query = options.query.trim()
  if (!query) return []

  const entries = entryActions.getFlattenMapEntries()
  const hits: Array<{
    entryId: string
    matchScore: number
    publishedAt: Date
    qualityScore: number | null
  }> = []

  for (const entry of Object.values(entries)) {
    if (!entry) continue

    if (options.allowedFeedIds && (!entry.feedId || !options.allowedFeedIds.has(entry.feedId)))
      continue

    if (options.smartFilter === "unread" && entry.read) continue
    if (options.smartFilter === "today" && !isSameLocalDay(entry.publishedAt, 0)) continue
    if (options.smartFilter === "yesterday" && !isSameLocalDay(entry.publishedAt, -1)) continue
    if (options.smartFilter === "starred" && !options.starredEntryIds?.has(entry.id)) continue

    if (options.topicLabel) {
      const tags = options.tagsByEntryId?.[entry.id]
      if (!tags?.some((t) => t.label === options.topicLabel)) continue
    }

    if (options.myTopicSelector) {
      const tags = options.tagsByEntryId?.[entry.id]
      if (!matchEntryBySelector(options.myTopicSelector, entry, tags as any)) continue
    }

    const matchScore = scoreKeywordMatch(
      {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        content: entry.content,
        publishedAt: entry.publishedAt,
      },
      query,
    )
    if (matchScore <= 0) continue

    const quality = entryQualityScoreActions.getScore(entry.id)
    hits.push({
      entryId: entry.id,
      matchScore,
      publishedAt: entry.publishedAt,
      qualityScore: quality?.quality_score ?? null,
    })
  }

  return sortSearchHits(hits, options.sort)
}

function resolveCurrentScopeConstraints(
  snapshotFeedId: string | null,
  myTopics: Array<{ id: string; selector: Parameters<typeof matchEntryBySelector>[0] }>,
  view: number,
): Pick<
  SearchEntryIdsOptions,
  "allowedFeedIds" | "smartFilter" | "topicLabel" | "myTopicSelector"
> {
  if (!snapshotFeedId || snapshotFeedId === ROUTE_FEED_PENDING) {
    return {
      allowedFeedIds: null,
      smartFilter: null,
      topicLabel: null,
      myTopicSelector: null,
    }
  }

  const smart = getSmartFeedScope(snapshotFeedId)
  if (smart === "today" || smart === "yesterday" || smart === "unread" || smart === "starred") {
    return {
      allowedFeedIds: null,
      smartFilter: smart,
      topicLabel: null,
      myTopicSelector: null,
    }
  }

  const topicLabel = getTopicLabelFromFeedId(snapshotFeedId)
  if (topicLabel) {
    return {
      allowedFeedIds: null,
      smartFilter: null,
      topicLabel,
      myTopicSelector: null,
    }
  }

  const myTopicId = getMyTopicIdFromFeedId(snapshotFeedId)
  if (myTopicId) {
    const topic = myTopics.find((t) => t.id === myTopicId)
    return {
      allowedFeedIds: null,
      smartFilter: null,
      topicLabel: null,
      myTopicSelector: topic?.selector ?? null,
    }
  }

  // Folder category or single feed id
  const folderFeeds = getCategoryFeedIds(snapshotFeedId, view as any)
  if (folderFeeds && folderFeeds.length > 1) {
    return {
      allowedFeedIds: new Set(folderFeeds),
      smartFilter: null,
      topicLabel: null,
      myTopicSelector: null,
    }
  }
  if (folderFeeds && folderFeeds.length === 1) {
    return {
      allowedFeedIds: new Set(folderFeeds),
      smartFilter: null,
      topicLabel: null,
      myTopicSelector: null,
    }
  }

  return {
    allowedFeedIds: new Set([snapshotFeedId]),
    smartFilter: null,
    topicLabel: null,
    myTopicSelector: null,
  }
}

/**
 * Hook: ranked entry ids for the active library search session.
 */
export function useLibrarySearchEntryIds(): string[] {
  const session = useLibrarySearchSession()
  const query = session.query.trim()
  const entryRevision = useEntryStore((s) => Object.keys(s.data).length)
  const tagsByEntryId = useEntryAiTagsStore((s) => s.data)
  const myTopics = useAtomValue(myTopicsAtom)

  return useMemo(() => {
    void entryRevision
    if (!query) return []

    const constraints =
      session.scopeMode === "current"
        ? resolveCurrentScopeConstraints(session.scopeSnapshotFeedId, myTopics, 0)
        : {
            allowedFeedIds: null,
            smartFilter: null,
            topicLabel: null,
            myTopicSelector: null,
          }

    return searchEntryIdsFromStore({
      query,
      sort: session.sort,
      scopeMode: session.scopeMode,
      ...constraints,
      tagsByEntryId,
    })
  }, [
    entryRevision,
    myTopics,
    query,
    session.scopeMode,
    session.scopeSnapshotFeedId,
    session.sort,
    tagsByEntryId,
  ])
}
