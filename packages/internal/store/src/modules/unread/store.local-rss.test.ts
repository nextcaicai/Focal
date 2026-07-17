import { FeedViewType } from "@follow/constants"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useEntryStore } from "../entry/store"
import type { EntryModel } from "../entry/types"
import { unreadSyncService, useUnreadStore } from "./store"

const { entryPatchManyMock, recordMarkReadMock, recordReadCompleteMock } = vi.hoisted(() => ({
  entryPatchManyMock: vi.fn(),
  recordMarkReadMock: vi.fn(),
  recordReadCompleteMock: vi.fn(),
}))

vi.mock("@follow/shared/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@follow/shared/constants")>()),
  LOCAL_RSS_MODE: true,
}))

vi.mock("@follow/database/services/entry", () => ({
  EntryService: {
    patchMany: entryPatchManyMock,
  },
}))

vi.mock("@follow/database/services/unread", () => ({
  UnreadService: {
    getUnreadAll: vi.fn(),
    reset: vi.fn(),
    upsertMany: vi.fn(),
  },
}))

vi.mock("../behavior-event/store", () => ({
  behaviorEventSyncService: {
    recordMarkRead: recordMarkReadMock,
    recordReadComplete: recordReadCompleteMock,
  },
}))

const entry: EntryModel = {
  id: "entry-1",
  guid: "entry-1-guid",
  insertedAt: new Date("2026-01-01T00:00:00.000Z"),
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  feedId: "feed-1",
  read: false,
}

describe("unreadSyncService in local RSS mode", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    entryPatchManyMock.mockImplementation(() => Promise.resolve())
    recordMarkReadMock.mockImplementation(() => Promise.resolve())
    recordReadCompleteMock.mockImplementation(() => Promise.resolve())
    useEntryStore.setState({
      data: {
        [entry.id]: entry,
      },
      entryIdByView: {
        [FeedViewType.All]: new Set([entry.id]),
        [FeedViewType.Articles]: new Set([entry.id]),
        [FeedViewType.Audios]: new Set(),
        [FeedViewType.Notifications]: new Set(),
        [FeedViewType.Pictures]: new Set(),
        [FeedViewType.SocialMedia]: new Set(),
        [FeedViewType.Videos]: new Set(),
      },
      entryIdByCategory: {},
      entryIdByFeed: {
        [entry.feedId!]: new Set([entry.id]),
      },
      entryIdByInbox: {},
      entryIdByList: {},
      entryIdSet: new Set([entry.id]),
    })
    useUnreadStore.setState({ data: { [entry.feedId!]: 1 } })
  })

  it("records mark_read audit events without treating mark-as-read as read completion", async () => {
    await unreadSyncService.markEntriesAsRead([entry.id], { source: "command" })

    expect(recordMarkReadMock).toHaveBeenCalledWith(entry.id, { source: "command" })
    expect(recordReadCompleteMock).not.toHaveBeenCalled()
  })
})
