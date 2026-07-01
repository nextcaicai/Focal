import { beforeEach, describe, expect, it, vi } from "vitest"

import type { EntrySchema, SubscriptionSchema } from "../schemas/types"

const { deleteExecuteMock, deleteWhereMock, entriesFindManyMock, subscriptionsFindManyMock } =
  vi.hoisted(() => ({
    deleteExecuteMock: vi.fn(),
    deleteWhereMock: vi.fn(),
    entriesFindManyMock: vi.fn(),
    subscriptionsFindManyMock: vi.fn(),
  }))

vi.mock("../db", () => ({
  db: {
    delete: vi.fn(() => ({
      where: deleteWhereMock,
    })),
    query: {
      entriesTable: {
        findMany: entriesFindManyMock,
      },
      subscriptionsTable: {
        findMany: subscriptionsFindManyMock,
      },
    },
  },
}))

const createEntry = (index: number, read: boolean): EntrySchema => ({
  id: `entry-${index}`,
  title: `Entry ${index}`,
  url: `https://example.com/${index}`,
  content: null,
  readabilityContent: null,
  readabilityUpdatedAt: null,
  description: null,
  guid: `entry-${index}`,
  author: null,
  authorUrl: null,
  authorAvatar: null,
  insertedAt: new Date("2026-06-30T10:00:00.000Z"),
  publishedAt: new Date(Date.UTC(2026, 5, 30, 10, 0, 0) - index * 1000),
  media: null,
  categories: null,
  attachments: null,
  extra: null,
  language: null,
  feedId: "feed-1",
  inboxHandle: null,
  read,
  sources: null,
  settings: null,
})

const subscription = {
  id: "feed/feed-1",
  feedId: "feed-1",
  listId: null,
  inboxId: null,
  userId: "local-user",
  view: 0,
  isPrivate: false,
  hideFromTimeline: null,
  title: null,
  category: null,
  createdAt: "2026-06-30T10:00:00.000Z",
  type: "feed",
} satisfies SubscriptionSchema

describe("EntryService.getEntriesToHydrate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteWhereMock.mockReturnValue({
      execute: deleteExecuteMock,
    })
    deleteExecuteMock.mockImplementation(async () => {})
    subscriptionsFindManyMock.mockResolvedValue([subscription])
  })

  it("hydrates subscribed entries without deleting local RSS history", async () => {
    entriesFindManyMock.mockResolvedValue([
      ...Array.from({ length: 20 }, (_, index) => createEntry(index + 1, false)),
      createEntry(21, true),
    ])

    const { EntryService } = await import("./entry")

    const entries = await EntryService.getEntriesToHydrate()

    expect(entries.map((entry) => entry.id)).toEqual(
      Array.from({ length: 21 }, (_, index) => `entry-${index + 1}`),
    )
    expect(deleteExecuteMock).not.toHaveBeenCalled()
  })
})
