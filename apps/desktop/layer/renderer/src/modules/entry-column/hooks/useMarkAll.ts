import { FeedViewType } from "@follow/constants"
import { getEntryIdsByBehaviorEventType } from "@follow/store/behavior-event/hooks"
import { useBehaviorEventStore } from "@follow/store/behavior-event/store"
import { useCollectionStore } from "@follow/store/collection/store"
import { useEntryStore } from "@follow/store/entry/store"
import { getCategoryFeedIds } from "@follow/store/subscription/getter"
import { unreadSyncService } from "@follow/store/unread/store"

import { getGeneralSettings } from "~/atoms/settings/general"
import { jotaiStore } from "~/lib/jotai"
import type { SmartFeedScope } from "~/lib/timeline-scope"
import {
  doesEntryMatchStarredGroupFilter,
  selectedStarredGroupAtom,
  starredGroupAssignmentsAtom,
} from "~/modules/starred-groups/store"

type PublishedAtMarkAllFilter = {
  startTime: number
  endTime: number
}
type InsertedBeforeMarkAllFilter = {
  insertedBefore: number
}
export type MarkAllFilter =
  | PublishedAtMarkAllFilter
  | InsertedBeforeMarkAllFilter
  | (PublishedAtMarkAllFilter & InsertedBeforeMarkAllFilter)

const getLocalDayRange = (dayOffset: 0 | -1): PublishedAtMarkAllFilter => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() + dayOffset)

  const end = new Date(start)
  end.setHours(23, 59, 59, 999)

  return {
    startTime: start.getTime(),
    endTime: end.getTime(),
  }
}

const getSmartFeedDateRange = (smartFeed: SmartFeedScope | undefined) => {
  if (smartFeed === "today") return getLocalDayRange(0)
  if (smartFeed === "yesterday") return getLocalDayRange(-1)
}

const intersectMarkAllFilters = (
  dateRange: PublishedAtMarkAllFilter,
  time?: MarkAllFilter,
): MarkAllFilter | null => {
  const startTime =
    time && "startTime" in time
      ? Math.max(dateRange.startTime, time.startTime)
      : dateRange.startTime
  const endTime =
    time && "endTime" in time ? Math.min(dateRange.endTime, time.endTime) : dateRange.endTime

  if (startTime > endTime) return null

  if (time && "insertedBefore" in time) {
    return {
      startTime,
      endTime,
      insertedBefore: time.insertedBefore,
    }
  }

  return {
    startTime,
    endTime,
  }
}

const filterEntryIdsByMarkAllFilter = (entryIds: string[], time?: MarkAllFilter) => {
  if (!time) return entryIds

  const entries = useEntryStore.getState().data

  return entryIds.filter((entryId) => {
    const entry = entries[entryId]
    if (!entry) return false

    const publishedAt = entry.publishedAt.getTime()
    if ("startTime" in time && publishedAt < time.startTime) return false
    if ("endTime" in time && publishedAt > time.endTime) return false
    if ("insertedBefore" in time && entry.insertedAt.getTime() >= time.insertedBefore) {
      return false
    }

    return true
  })
}

export const markAllByRoute = async (
  data: {
    feedId?: string | undefined
    view: FeedViewType
    inboxId?: string | undefined
    listId?: string | undefined

    isAllFeeds?: boolean
    isCollection?: boolean
    smartFeed?: SmartFeedScope
  },
  time?: MarkAllFilter,
) => {
  const { feedId, view, inboxId, listId, isAllFeeds, isCollection, smartFeed } = data

  if (!feedId) return

  if (isCollection) {
    const selectedGroupId = jotaiStore.get(selectedStarredGroupAtom)
    const assignments = jotaiStore.get(starredGroupAssignmentsAtom)
    const entryIds = Object.values(useCollectionStore.getState().collections)
      .filter((collection) => view === FeedViewType.All || collection.view === view)
      .filter((collection) =>
        doesEntryMatchStarredGroupFilter({
          entryId: collection.entryId,
          selectedGroupId,
          assignments,
        }),
      )
      .sort((a, b) => (new Date(a.createdAt ?? 0) > new Date(b.createdAt ?? 0) ? -1 : 1))
      .map((collection) => collection.entryId)

    if (entryIds.length > 0) {
      await unreadSyncService.markEntriesAsRead(entryIds)
    }
    return
  }

  const { hidePrivateSubscriptionsInTimeline: excludePrivate } = getGeneralSettings()
  const smartFeedDateRange = getSmartFeedDateRange(smartFeed)

  if (smartFeed === "readLater") {
    const entryIds = filterEntryIdsByMarkAllFilter(
      getEntryIdsByBehaviorEventType(useBehaviorEventStore.getState().events, "read_later"),
      time,
    )

    if (entryIds.length > 0) {
      await unreadSyncService.markEntriesAsRead(entryIds)
    }
    return
  }

  if (smartFeedDateRange || smartFeed === "unread") {
    const smartFeedTime = smartFeedDateRange
      ? intersectMarkAllFilters(smartFeedDateRange, time)
      : time
    if (smartFeedTime === null) return

    unreadSyncService.markBatchAsRead({
      view,
      time: smartFeedTime,
      excludePrivate,
    })
    return
  }

  const folderIds = getCategoryFeedIds(feedId, view)
  if (typeof feedId === "number" || isAllFeeds) {
    unreadSyncService.markBatchAsRead({
      view,
      time,
      excludePrivate,
    })
  } else if (inboxId) {
    unreadSyncService.markBatchAsRead({
      filter: {
        inboxId,
      },
      view,
      time,
      excludePrivate,
    })
  } else if (listId) {
    unreadSyncService.markBatchAsRead({
      filter: {
        listId,
      },
      view,
      time,
      excludePrivate,
    })
  } else if (folderIds?.length) {
    unreadSyncService.markBatchAsRead({
      filter: {
        feedIdList: folderIds,
      },
      view,
      time,
      excludePrivate,
    })
  } else if (feedId) {
    unreadSyncService.markBatchAsRead({
      filter: {
        feedIdList: feedId?.split(","),
      },
      view,
      time,
      excludePrivate,
    })
  }
}
