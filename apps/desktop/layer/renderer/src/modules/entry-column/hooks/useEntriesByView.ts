import { FeedViewType, getView } from "@follow/constants"
import { LOCAL_RSS_MODE } from "@follow/shared/constants"
import { useAllCollectionEntryList, useCollectionEntryList } from "@follow/store/collection/hooks"
import { useCollectionStore } from "@follow/store/collection/store"
import { isOnboardingEntryUrl } from "@follow/store/constants/onboarding"
import {
  useEntriesQuery,
  useEntryIdsByFeedId,
  useEntryIdsByFeedIds,
  useEntryIdsByInboxId,
  useEntryIdsByListId,
  useEntryIdsByView,
} from "@follow/store/entry/hooks"
import { sortEntryIdsByRecommended } from "@follow/store/entry/sort"
import { entryActions, entrySyncServices, useEntryStore } from "@follow/store/entry/store"
import type { UseEntriesReturn } from "@follow/store/entry/types"
import { fallbackReturn } from "@follow/store/entry/utils"
import {
  buildSemanticScoreByEntryId,
  SEMANTIC_TOPIC_MIN_SCORE,
} from "@follow/store/entry-embedding/semantic-search"
import { useEntryEmbeddingStore } from "@follow/store/entry-embedding/store"
import { useEntryRankScoreStore } from "@follow/store/entry-rank-score/store"
import { useEntryAiTagsStore } from "@follow/store/entry-tags/store"
import { useFolderFeedsByFeedId } from "@follow/store/subscription/hooks"
import { unreadSyncService } from "@follow/store/unread/store"
import { nextFrame } from "@follow/utils"
import { isBizId } from "@follow/utils/utils"
import { useMutation } from "@tanstack/react-query"
import { debounce } from "es-toolkit/compat"
import { useAtomValue } from "jotai"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useLibrarySearchActive } from "~/atoms/library-search"
import { getAISettings } from "~/atoms/settings/ai"
import { useActionLanguage, useGeneralSettingKey } from "~/atoms/settings/general"
import { ROUTE_FEED_PENDING } from "~/constants/app"
import { useFeature } from "~/hooks/biz/useFeature"
import { useQueryEmbeddingVector } from "~/hooks/biz/useQueryEmbeddingVector"
import { useRouteParams } from "~/hooks/biz/useRouteParams"
import {
  getMyTopicIdFromFeedId,
  getSmartFeedScope,
  getTopicLabelFromFeedId,
} from "~/lib/timeline-scope"
import {
  triggerEntryEmbeddingLibraryBackfill,
  triggerEntryEnrichmentBackfill,
  triggerEntryRankBackfill,
} from "~/modules/entry-enrichment/trigger"
import { localRssRefreshScheduler } from "~/modules/local-rss/refresh-scheduler"
import { matchEntryBySelector } from "~/modules/my-topics/selector"
import { myTopicsAtom } from "~/modules/my-topics/store"
import {
  doesEntryMatchStarredGroupFilter,
  selectedStarredGroupAtom,
  starredGroupAssignmentsAtom,
} from "~/modules/starred-groups/store"
import { useLibrarySearchEntryIds } from "~/store/search/library-search"

import { aiTimelineEnabledAtom } from "../atoms/ai-timeline"
import { recommendedTimelineEnabledAtom } from "../atoms/recommended-timeline"
import { getVisibleLocalEntryIds } from "./filter-local-entry-ids"
import { useIsPreviewFeed } from "./useIsPreviewFeed"

const useRemoteEntries = (): UseEntriesReturn => {
  const { feedId, view, inboxId, listId } = useRouteParams()
  const isPreview = useIsPreviewFeed()

  const unreadOnly = useGeneralSettingKey("unreadOnly")
  const hidePrivateSubscriptionsInTimeline = useGeneralSettingKey(
    "hidePrivateSubscriptionsInTimeline",
  )
  const aiTimelineEnabled = useAtomValue(aiTimelineEnabledAtom)
  const aiEnabled = useFeature("ai")

  const folderIds = useFolderFeedsByFeedId({
    feedId,
    view,
  })

  const entriesOptions = useMemo(() => {
    const params = {
      feedId: folderIds?.join(",") || feedId,
      inboxId,
      listId,
      view,
      ...(unreadOnly === true && !isPreview && { unreadOnly: true }),
      ...(hidePrivateSubscriptionsInTimeline === true && {
        hidePrivateSubscriptionsInTimeline: true,
      }),
      ...(view === FeedViewType.All && { limit: 40 }),
      ...(aiTimelineEnabled && aiEnabled && { aiSort: true }),
    }

    if (feedId && listId && isBizId(feedId)) {
      delete params.listId
    }

    return params
  }, [
    feedId,
    folderIds,
    inboxId,
    listId,
    unreadOnly,
    isPreview,
    view,
    hidePrivateSubscriptionsInTimeline,
    aiTimelineEnabled,
    aiEnabled,
  ])
  const query = useEntriesQuery(LOCAL_RSS_MODE ? undefined : entriesOptions)

  const [fetchedTime, setFetchedTime] = useState<number>()
  useEffect(() => {
    if (!query.isFetching) {
      setFetchedTime(Date.now())
    }
  }, [query.isFetching])

  const refetch = useCallback(async () => void query.refetch(), [query])
  const fetchNextPage = useCallback(async () => void query.fetchNextPage(), [query])

  if (!query.data || query.isLoading) {
    return fallbackReturn
  }
  return {
    entriesIds: query.entriesIds,
    hasNext: query.hasNextPage,
    refetch,

    fetchNextPage,
    isLoading: query.isFetching,
    isRefetching: query.isRefetching,
    isReady: query.isSuccess,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetching: query.isFetching,
    hasNextPage: query.hasNextPage,
    error: query.isError ? query.error : null,
    fetchedTime,
    queryKey: query.queryKey,
  }
}

function getEntryIdsFromMultiplePlace(...entryIds: Array<string[] | undefined | null>) {
  return entryIds.find((ids) => ids?.length) ?? []
}

const isSameLocalDay = (date: Date, offset: number) => {
  const target = new Date()
  target.setDate(target.getDate() + offset)

  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  )
}

const sortEntryIdsByPublishedAtDesc = (entryIds: string[]) => {
  const entries = entryActions.getFlattenMapEntries()

  return entryIds.concat().sort((a, b) => {
    const entryA = entries[a]
    const entryB = entries[b]

    if (!entryA || !entryB) return 0
    return entryB.publishedAt.getTime() - entryA.publishedAt.getTime()
  })
}

const useLocalEntries = (): UseEntriesReturn => {
  const librarySearchActive = useLibrarySearchActive()
  const librarySearchEntryIds = useLibrarySearchEntryIds()
  const { feedId, view, inboxId, listId, isCollection } = useRouteParams()
  const smartFeed = getSmartFeedScope(feedId)
  const topicLabel = getTopicLabelFromFeedId(feedId)
  const myTopics = useAtomValue(myTopicsAtom)
  const myTopicId = getMyTopicIdFromFeedId(feedId)
  const myTopic = useMemo(
    () => (myTopicId ? myTopics.find((topic) => topic.id === myTopicId) : undefined),
    [myTopicId, myTopics],
  )
  const keywordTopicQuery =
    myTopic?.selector.type === "keyword" ? myTopic.selector.query.trim() : ""
  const keywordTopicQueryVector = useQueryEmbeddingVector(keywordTopicQuery)
  const embeddingData = useEntryEmbeddingStore((state) => state.data)
  const keywordTopicSemanticScores = useMemo(() => {
    if (!keywordTopicQuery || !keywordTopicQueryVector) return null
    return buildSemanticScoreByEntryId(keywordTopicQueryVector, embeddingData, {
      minScore: SEMANTIC_TOPIC_MIN_SCORE,
    })
  }, [keywordTopicQuery, keywordTopicQueryVector, embeddingData])
  const selectedStarredGroupId = useAtomValue(selectedStarredGroupAtom)
  const starredGroupAssignments = useAtomValue(starredGroupAssignmentsAtom)
  const isVirtualScope = !!smartFeed || !!topicLabel || !!myTopic
  const unreadOnly = useGeneralSettingKey("unreadOnly")
  const effectiveUnreadOnly = unreadOnly || smartFeed === "unread"
  const hidePrivateSubscriptionsInTimeline = useGeneralSettingKey(
    "hidePrivateSubscriptionsInTimeline",
  )
  const recommendedTimelineEnabled = useAtomValue(recommendedTimelineEnabledAtom)
  const rankRevision = useEntryRankScoreStore((state) =>
    Object.entries(state.data)
      .map(
        ([entryId, record]) => `${entryId}:${record.computed_at}:${record.components.base_score}`,
      )
      .join("|"),
  )
  const collectionRevision = useCollectionStore((state) =>
    Object.keys(state.collections).sort().join("|"),
  )
  const rankingRevision = `${collectionRevision}:${rankRevision}`

  const folderIds = useFolderFeedsByFeedId({
    feedId: isVirtualScope ? undefined : feedId,
    view,
  })
  const entryIdsByView = useEntryIdsByView(view, hidePrivateSubscriptionsInTimeline)
  const entryIdsByCollections = useCollectionEntryList(view)
  const allCollectionEntryIds = useAllCollectionEntryList()
  const entryIdsByFeedId = useEntryIdsByFeedId(isVirtualScope ? undefined : feedId)
  const entryIdsByCategory = useEntryIdsByFeedIds(folderIds)
  const entryIdsByListId = useEntryIdsByListId(listId)
  const entryIdsByInboxId = useEntryIdsByInboxId(inboxId)
  const tagsByEntryId = useEntryAiTagsStore((state) => state.data)

  const showEntriesByView =
    (!feedId || feedId === ROUTE_FEED_PENDING) &&
    folderIds.length === 0 &&
    !isCollection &&
    !inboxId &&
    !listId

  const localQueryKey = useMemo(
    () => [feedId || "", view, inboxId || "", listId || "", isCollection ? "1" : "0"].join(":"),
    [feedId, inboxId, isCollection, listId, view],
  )
  const stickyVisibleStateRef = useRef<{
    queryKey: string
    ids: Set<string>
  }>({
    queryKey: localQueryKey,
    ids: new Set<string>(),
  })

  const allEntries = useEntryStore(
    useCallback(
      (state) => {
        const ids =
          smartFeed === "starred"
            ? allCollectionEntryIds
            : isVirtualScope
              ? (entryIdsByView ?? [])
              : isCollection
                ? entryIdsByCollections
                : showEntriesByView
                  ? (entryIdsByView ?? [])
                  : (getEntryIdsFromMultiplePlace(
                      entryIdsByFeedId,
                      entryIdsByCategory,
                      entryIdsByListId,
                      entryIdsByInboxId,
                    ) ?? [])

        const stickyVisibleIds =
          effectiveUnreadOnly && stickyVisibleStateRef.current.queryKey === localQueryKey
            ? stickyVisibleStateRef.current.ids
            : undefined

        const visibleIds = getVisibleLocalEntryIds({
          sourceIds: ids,
          entries: state.data,
          stickyVisibleIds,
          unreadOnly: effectiveUnreadOnly,
        })

        return visibleIds.filter((entryId) => {
          const entry = state.data[entryId]
          if (!entry) return false

          if (smartFeed === "today") {
            return isSameLocalDay(entry.publishedAt, 0)
          }
          if (smartFeed === "yesterday") {
            return isSameLocalDay(entry.publishedAt, -1)
          }
          if (topicLabel) {
            return tagsByEntryId[entryId]?.some((tag) => tag.label === topicLabel) ?? false
          }
          if (myTopic) {
            return matchEntryBySelector(myTopic.selector, entry, tagsByEntryId[entryId], {
              entryId,
              semanticScores: keywordTopicSemanticScores,
              semanticMinScore: SEMANTIC_TOPIC_MIN_SCORE,
            })
          }
          if (smartFeed === "starred") {
            return doesEntryMatchStarredGroupFilter({
              entryId,
              selectedGroupId: selectedStarredGroupId,
              assignments: starredGroupAssignments,
            })
          }

          return true
        })
      },
      [
        allCollectionEntryIds,
        entryIdsByCategory,
        entryIdsByCollections,
        entryIdsByFeedId,
        entryIdsByInboxId,
        entryIdsByListId,
        entryIdsByView,
        isCollection,
        isVirtualScope,
        localQueryKey,
        showEntriesByView,
        effectiveUnreadOnly,
        smartFeed,
        selectedStarredGroupId,
        starredGroupAssignments,
        tagsByEntryId,
        topicLabel,
        myTopic,
        keywordTopicSemanticScores,
      ],
    ),
  )

  useEffect(() => {
    stickyVisibleStateRef.current = {
      queryKey: localQueryKey,
      ids: effectiveUnreadOnly ? new Set(allEntries) : new Set<string>(),
    }
  }, [allEntries, effectiveUnreadOnly, localQueryKey])

  const sortedEntries = useMemo(() => {
    // Library search takes over the middle column list while active.
    if (librarySearchActive) return librarySearchEntryIds

    void rankingRevision

    if (!allEntries?.length) return allEntries ?? []
    const latestEntries = isVirtualScope ? sortEntryIdsByPublishedAtDesc(allEntries) : allEntries
    if (!recommendedTimelineEnabled) return latestEntries

    return sortEntryIdsByRecommended(latestEntries)
  }, [
    allEntries,
    isVirtualScope,
    librarySearchActive,
    librarySearchEntryIds,
    rankingRevision,
    recommendedTimelineEnabled,
  ])

  const [page, setPage] = useState(0)
  const pageSize = 30
  const totalPage = useMemo(
    () => (sortedEntries ? Math.ceil(sortedEntries.length / pageSize) : 0),
    [sortedEntries],
  )

  const entries = useMemo(() => {
    return sortedEntries?.slice(0, (page + 1) * pageSize) || []
  }, [sortedEntries, page, pageSize])

  const hasNext = useMemo(() => {
    return entries.length < (sortedEntries?.length || 0)
  }, [entries.length, sortedEntries])

  const refetch = useCallback(async () => {
    setPage(0)
  }, [])

  const fetchNextPage = useMemo(
    () =>
      debounce(async () => {
        setPage((currentPage) => currentPage + 1)
      }, 300),
    [],
  )

  useEffect(() => {
    setPage(0)
  }, [
    view,
    feedId,
    recommendedTimelineEnabled,
    selectedStarredGroupId,
    librarySearchActive,
    librarySearchEntryIds,
  ])

  return {
    entriesIds: entries,
    hasNext,
    refetch,
    fetchNextPage: fetchNextPage as () => Promise<void>,
    isLoading: false,
    isRefetching: false,
    isReady: true,
    isFetchingNextPage: false,
    isFetching: false,
    hasNextPage: page < totalPage,
    error: null,
  }
}

export const useEntriesByView = ({ onReset }: { onReset?: () => void }) => {
  const { view, listId, isCollection } = useRouteParams()
  const actionLanguage = useActionLanguage()
  const selectedStarredGroupId = useAtomValue(selectedStarredGroupAtom)
  const starredGroupAssignments = useAtomValue(starredGroupAssignmentsAtom)

  const remoteQuery = useRemoteEntries()
  const localQuery = useLocalEntries()

  useFetchEntryContentByStream(LOCAL_RSS_MODE ? undefined : remoteQuery.entriesIds)

  const entryIdsForEnrichment = LOCAL_RSS_MODE ? localQuery.entriesIds : remoteQuery.entriesIds
  const enrichmentFetchedTime = LOCAL_RSS_MODE ? undefined : remoteQuery.fetchedTime
  useEntryEnrichmentBackfill(entryIdsForEnrichment, actionLanguage, enrichmentFetchedTime)
  useEntryRankBackfill(entryIdsForEnrichment)

  // If remote data is not available, we use the local data, get the local data length
  // FIXME: remote first, then local store data
  // NOTE: We still can't use the store's data handling directly.
  // Imagine that the local data may be persistent, and then if there are incremental updates to the data on the server side,
  // then we have no way to incrementally update the data.
  // We need to add an interface to incrementally update the data based on the version hash.

  const query = LOCAL_RSS_MODE ? localQuery : remoteQuery.isReady ? remoteQuery : localQuery
  const entryIds: string[] = useMemo(() => {
    if (!isCollection) return query.entriesIds

    return query.entriesIds.filter((entryId) =>
      doesEntryMatchStarredGroupFilter({
        entryId,
        selectedGroupId: selectedStarredGroupId,
        assignments: starredGroupAssignments,
      }),
    )
  }, [isCollection, query.entriesIds, selectedStarredGroupId, starredGroupAssignments])

  const isFetchingFirstPage =
    !LOCAL_RSS_MODE && remoteQuery.isFetching && !remoteQuery.isFetchingNextPage

  useEffect(() => {
    if (isFetchingFirstPage) {
      nextFrame(() => {
        onReset?.()
      })
    }
  }, [isFetchingFirstPage, onReset, query.queryKey])

  const groupByDate = useGeneralSettingKey("groupByDate")
  const groupedCounts: number[] | undefined = useMemo(() => {
    const viewDefinition = getView(view)
    if (viewDefinition?.gridMode || view === FeedViewType.All) {
      return
    }
    if (!groupByDate) {
      return
    }
    const entriesId2Map = entryActions.getFlattenMapEntries()
    const counts = [] as number[]
    let lastDate = ""
    for (const id of entryIds) {
      const entry = entriesId2Map[id]
      if (!entry) {
        continue
      }
      if (isOnboardingEntryUrl(entry.url)) {
        continue
      }
      const date = new Date(listId ? entry.insertedAt : entry.publishedAt).toDateString()
      if (date !== lastDate) {
        counts.push(1)
        lastDate = date
      } else {
        const last = counts.pop()
        if (last) counts.push(last + 1)
      }
    }

    return counts
  }, [groupByDate, listId, entryIds, view])

  return {
    ...query,

    type: LOCAL_RSS_MODE || !remoteQuery.isReady ? ("local" as const) : ("remote" as const),
    refetch: useCallback(() => {
      if (LOCAL_RSS_MODE) {
        const promise = localRssRefreshScheduler
          .runRefresh("manual")
          .then(() => localQuery.refetch())
        return promise
      }

      const promise = query.refetch()
      unreadSyncService.resetFromRemote()
      return promise
    }, [localQuery, query]),
    entriesIds: entryIds,
    groupedCounts,
    isFetching: LOCAL_RSS_MODE ? localQuery.isFetching : remoteQuery.isFetching,
    isFetchingNextPage: LOCAL_RSS_MODE
      ? localQuery.isFetchingNextPage
      : remoteQuery.isFetchingNextPage,
    isLoading: LOCAL_RSS_MODE ? localQuery.isLoading : remoteQuery.isLoading,
  }
}

const ENRICHMENT_RETRY_MS = 45_000
const EMBEDDING_LIBRARY_BACKFILL_MS = 60_000

const useEntryEnrichmentBackfill = (
  entryIds: string[],
  actionLanguage: ReturnType<typeof useActionLanguage>,
  fetchedTime?: number,
) => {
  const embeddingHydrated = useEntryEmbeddingStore((state) => state.hydrated)
  const summaryEnabled = useGeneralSettingKey("summary")
  const translationEnabled = useGeneralSettingKey("translation")
  const autoTagEnabled = useGeneralSettingKey("autoTag")
  const qualityScoreEnabled = useGeneralSettingKey("qualityScore")
  const translationMode = useGeneralSettingKey("translationMode")
  const entryIdsKey = useMemo(() => entryIds.join("\0"), [entryIds])

  useEffect(() => {
    const embeddingEnabled =
      LOCAL_RSS_MODE && embeddingHydrated && (getAISettings().embedding?.enabled ?? false)
    const byokEnabled =
      summaryEnabled || translationEnabled || autoTagEnabled || qualityScoreEnabled

    if (!byokEnabled && !embeddingEnabled) return
    if (entryIds.length === 0 && !embeddingEnabled) return

    let cancelled = false

    const runBackfill = () => {
      if (cancelled) return
      if (
        (byokEnabled || embeddingEnabled) && // Visible set: BYOK unread-only inside trigger; embedding includes read.
        entryIds.length > 0
      ) {
        triggerEntryEnrichmentBackfill(entryIds)
      }
      if (embeddingEnabled) {
        // Full library gap-fill so historical/read entries enter the semantic index.
        triggerEntryEmbeddingLibraryBackfill()
      }
    }

    runBackfill()
    const retryTimer = setInterval(
      runBackfill,
      embeddingEnabled && !byokEnabled ? EMBEDDING_LIBRARY_BACKFILL_MS : ENRICHMENT_RETRY_MS,
    )

    return () => {
      cancelled = true
      clearInterval(retryTimer)
    }
  }, [
    actionLanguage,
    autoTagEnabled,
    embeddingHydrated,
    entryIds,
    entryIdsKey,
    fetchedTime,
    qualityScoreEnabled,
    summaryEnabled,
    translationEnabled,
    translationMode,
  ])
}

const useEntryRankBackfill = (entryIds: string[]) => {
  const entryIdsKey = useMemo(() => entryIds.join("\0"), [entryIds])

  useEffect(() => {
    if (!LOCAL_RSS_MODE || entryIds.length === 0) return

    const timer = setTimeout(() => {
      triggerEntryRankBackfill(entryIds)
    }, 500)

    return () => clearTimeout(timer)
  }, [entryIds, entryIdsKey])
}

const useFetchEntryContentByStream = (remoteEntryIds?: string[]) => {
  const { mutate: updateEntryContent } = useMutation({
    mutationKey: ["stream-entry-content", remoteEntryIds],
    mutationFn: (remoteEntryIds: string[]) =>
      entrySyncServices.fetchEntryContentByStream(remoteEntryIds),
  })

  useEffect(() => {
    if (!remoteEntryIds) return
    updateEntryContent(remoteEntryIds)
  }, [remoteEntryIds, updateEntryContent])
}
