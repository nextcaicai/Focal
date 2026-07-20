import { FeedViewType } from "@follow/constants"
import { useBehaviorEventStore } from "@follow/store/behavior-event/store"
import { useCollectionStore } from "@follow/store/collection/store"
import { unreadSyncService } from "@follow/store/unread/store"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { jotaiStore } from "~/lib/jotai"
import {
  SMART_FEED_READ_LATER,
  SMART_FEED_RECOMMENDED,
  SMART_FEED_TODAY,
  SMART_FEED_UNREAD,
} from "~/lib/timeline-scope"
import {
  selectedStarredGroupAtom,
  STARRED_GROUP_ALL,
  starredGroupAssignmentsAtom,
} from "~/modules/starred-groups/store"

import { markAllByRoute } from "./useMarkAll"

const getEntryIdsByViewMock = vi.hoisted(() =>
  vi.fn((_view: FeedViewType, _excludePrivate: boolean | undefined): string[] => []),
)
const sortEntryIdsByRecommendedMock = vi.hoisted(() => vi.fn((entryIds: string[]) => entryIds))

vi.mock("@follow/store/entry/getter", () => ({
  getEntryIdsByView: (view: FeedViewType, excludePrivate: boolean | undefined) =>
    getEntryIdsByViewMock(view, excludePrivate),
}))

vi.mock("@follow/store/entry/sort", () => ({
  sortEntryIdsByRecommended: (entryIds: string[]) => sortEntryIdsByRecommendedMock(entryIds),
}))

vi.mock("@follow/store/subscription/getter", () => ({
  getCategoryFeedIds: () => [],
}))

vi.mock("@follow/store/unread/store", () => ({
  unreadSyncService: {
    markBatchAsRead: vi.fn(),
    markEntriesAsRead: vi.fn(),
  },
}))

vi.mock("~/atoms/settings/general", () => ({
  getGeneralSettings: () => ({
    hidePrivateSubscriptionsInTimeline: false,
  }),
}))

describe("markAllByRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useBehaviorEventStore.setState({ events: [] })
    useCollectionStore.setState({ collections: {} })
    getEntryIdsByViewMock.mockReset()
    getEntryIdsByViewMock.mockReturnValue([])
    sortEntryIdsByRecommendedMock.mockReset()
    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) => entryIds)
    jotaiStore.set(selectedStarredGroupAtom, STARRED_GROUP_ALL)
    jotaiStore.set(starredGroupAssignmentsAtom, {})
  })

  it("marks starred collection entries as read without treating collections as a feed id", async () => {
    useCollectionStore.setState({
      collections: {
        "entry-1": {
          entryId: "entry-1",
          feedId: "feed-1",
          view: FeedViewType.Articles,
          createdAt: "2026-06-12T00:00:00.000Z",
        },
        "entry-2": {
          entryId: "entry-2",
          feedId: "feed-2",
          view: FeedViewType.Pictures,
          createdAt: "2026-06-13T00:00:00.000Z",
        },
      },
    })

    await markAllByRoute({
      feedId: "collections",
      view: FeedViewType.All,
      isCollection: true,
    })

    expect(unreadSyncService.markEntriesAsRead).toHaveBeenCalledWith(["entry-2", "entry-1"])
    expect(unreadSyncService.markBatchAsRead).not.toHaveBeenCalled()
  })

  it("marks today's smart feed by date range instead of its virtual feed id", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-09T10:30:00.000"))

    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(todayStart)
      todayEnd.setHours(23, 59, 59, 999)
      const routeParams = {
        feedId: SMART_FEED_TODAY,
        view: FeedViewType.All,
        smartFeed: "today" as const,
      }

      await markAllByRoute(routeParams)

      expect(unreadSyncService.markBatchAsRead).toHaveBeenCalledTimes(1)
      const [args] = vi.mocked(unreadSyncService.markBatchAsRead).mock.calls[0]!
      expect(args).toEqual({
        view: FeedViewType.All,
        time: {
          startTime: todayStart.getTime(),
          endTime: todayEnd.getTime(),
        },
        excludePrivate: false,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps the footer insertedBefore limit when marking today's smart feed", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-09T10:30:00.000"))

    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(todayStart)
      todayEnd.setHours(23, 59, 59, 999)
      const insertedBefore = new Date("2026-07-09T10:00:00.000").getTime()
      const routeParams = {
        feedId: SMART_FEED_TODAY,
        view: FeedViewType.All,
        smartFeed: "today" as const,
      }

      await markAllByRoute(routeParams, { insertedBefore })

      expect(unreadSyncService.markBatchAsRead).toHaveBeenCalledTimes(1)
      const [args] = vi.mocked(unreadSyncService.markBatchAsRead).mock.calls[0]!
      expect(args).toEqual({
        view: FeedViewType.All,
        time: {
          startTime: todayStart.getTime(),
          endTime: todayEnd.getTime(),
          insertedBefore,
        },
        excludePrivate: false,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("marks the all-unread smart feed without treating it as a real feed id", async () => {
    await markAllByRoute({
      feedId: SMART_FEED_UNREAD,
      view: FeedViewType.All,
      smartFeed: "unread",
    })

    expect(unreadSyncService.markBatchAsRead).toHaveBeenCalledTimes(1)
    const [args] = vi.mocked(unreadSyncService.markBatchAsRead).mock.calls[0]!
    expect(args).toEqual({
      view: FeedViewType.All,
      time: undefined,
      excludePrivate: false,
    })
  })

  it("marks read-later entries as read without treating read later as a feed id", async () => {
    useBehaviorEventStore.setState({
      events: [
        {
          id: "entry-1-read-later",
          entryId: "entry-1",
          eventType: "read_later",
          createdAt: "2026-07-11T00:00:00.000Z",
        },
        {
          id: "entry-2-read-later",
          entryId: "entry-2",
          eventType: "read_later",
          createdAt: "2026-07-12T00:00:00.000Z",
        },
        {
          id: "entry-3-favorite",
          entryId: "entry-3",
          eventType: "favorite",
          createdAt: "2026-07-13T00:00:00.000Z",
        },
      ],
    })

    await markAllByRoute({
      feedId: SMART_FEED_READ_LATER,
      view: FeedViewType.All,
      smartFeed: "readLater",
    })

    expect(unreadSyncService.markEntriesAsRead).toHaveBeenCalledWith(["entry-2", "entry-1"])
    expect(unreadSyncService.markBatchAsRead).not.toHaveBeenCalled()
  })

  it("marks recommended entries as read without treating recommended as a real feed id", async () => {
    getEntryIdsByViewMock.mockReturnValue(["low", "high", "dismissed"])
    sortEntryIdsByRecommendedMock.mockReturnValue(["high"])

    await markAllByRoute({
      feedId: SMART_FEED_RECOMMENDED,
      view: FeedViewType.All,
      smartFeed: "recommended",
    })

    expect(getEntryIdsByViewMock).toHaveBeenCalledWith(FeedViewType.All, false)
    expect(sortEntryIdsByRecommendedMock).toHaveBeenCalledWith(["low", "high", "dismissed"])
    expect(unreadSyncService.markEntriesAsRead).toHaveBeenCalledWith(["high"])
    expect(unreadSyncService.markBatchAsRead).not.toHaveBeenCalled()
  })

  it("keeps the footer insertedBefore limit when marking the all-unread smart feed", async () => {
    const insertedBefore = new Date("2026-07-09T10:00:00.000").getTime()

    await markAllByRoute(
      {
        feedId: SMART_FEED_UNREAD,
        view: FeedViewType.All,
        smartFeed: "unread",
      },
      { insertedBefore },
    )

    expect(unreadSyncService.markBatchAsRead).toHaveBeenCalledTimes(1)
    const [args] = vi.mocked(unreadSyncService.markBatchAsRead).mock.calls[0]!
    expect(args).toEqual({
      view: FeedViewType.All,
      time: {
        insertedBefore,
      },
      excludePrivate: false,
    })
  })
})
