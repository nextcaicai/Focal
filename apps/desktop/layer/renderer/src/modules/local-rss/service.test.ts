import type { EntrySchema } from "@follow/database/schemas/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  collectionUpsertManyMock,
  entryGetManyMock,
  entryStoreData,
  entryUpsertManyMock,
  feedUpsertManyMock,
  previewMock,
  unreadUpdateByIdMock,
} = vi.hoisted(() => ({
  collectionUpsertManyMock: vi.fn(),
  entryGetManyMock: vi.fn(),
  entryStoreData: {} as Record<string, EntrySchema>,
  entryUpsertManyMock: vi.fn(),
  feedUpsertManyMock: vi.fn(),
  previewMock: vi.fn(),
  unreadUpdateByIdMock: vi.fn(),
}))

vi.mock("@follow/database/services/entry", () => ({
  EntryService: {
    getEntryMany: entryGetManyMock,
  },
}))

vi.mock("@follow/store/action/local", () => ({
  applyLocalActionRulesToEntry: vi.fn(),
  runLocalActionSideEffects: vi.fn(),
}))

vi.mock("@follow/store/action/store", () => ({
  useActionStore: {
    getState: () => ({ rules: [] }),
  },
}))

vi.mock("@follow/store/collection/store", () => ({
  collectionActions: {
    upsertMany: collectionUpsertManyMock,
  },
}))

vi.mock("@follow/store/entry/hooks", () => ({
  invalidateEntriesQuery: vi.fn(),
}))

vi.mock("@follow/store/entry/store", () => ({
  entryActions: {
    upsertMany: entryUpsertManyMock,
  },
  entrySyncServices: {
    fetchEntryReadabilityContent: vi.fn(),
  },
  useEntryStore: {
    getState: () => ({ data: entryStoreData }),
  },
}))

vi.mock("@follow/store/feed/getter", () => ({
  getFeedByIdOrUrl: vi.fn(),
}))

vi.mock("@follow/store/feed/store", () => ({
  feedActions: {
    upsertMany: feedUpsertManyMock,
    upsertManyInSession: vi.fn(),
  },
}))

vi.mock("@follow/store/subscription/store", () => ({
  subscriptionActions: {
    upsertMany: vi.fn(),
  },
  useSubscriptionStore: {
    getState: () => ({ data: {} }),
  },
}))

vi.mock("@follow/store/subscription/utils", () => ({
  inferSubscriptionViewFromFeed: vi.fn(),
}))

vi.mock("@follow/store/unread/store", () => ({
  unreadActions: {
    updateById: unreadUpdateByIdMock,
  },
}))

vi.mock("@follow/store/user/getters", () => ({
  whoami: vi.fn(),
}))

vi.mock("@follow/store/user/store", () => ({
  LOCAL_USER_ID: "local-user",
}))

vi.mock("~/atoms/settings/general", () => ({
  getActionLanguage: vi.fn(),
}))

vi.mock("~/lib/client", () => ({
  ipcServices: {
    rss: {
      preview: previewMock,
    },
  },
}))

vi.mock("~/modules/entry-enrichment/trigger", () => ({
  triggerEntryEnrichmentFromIngest: vi.fn(),
  triggerEntryRankFromIngest: vi.fn(),
}))

const createPreviewEntry = (read: boolean) => ({
  id: "local-entry-x-post",
  title: "X post",
  url: "https://x.com/example/status/1",
  content: "Post content",
  readabilityContent: null,
  readabilityUpdatedAt: null,
  description: "Post content",
  guid: "https://x.com/example/status/1",
  author: "example",
  authorUrl: null,
  authorAvatar: null,
  insertedAt: "2026-06-30T10:00:00.000Z",
  publishedAt: "2026-06-30T09:00:00.000Z",
  media: null,
  categories: null,
  attachments: null,
  extra: null,
  language: null,
  feedId: "local-feed-x",
  inboxHandle: null,
  read,
  sources: null,
  settings: null,
})

describe("refreshLocalRssFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(entryStoreData)) {
      delete entryStoreData[key]
    }
    entryGetManyMock.mockResolvedValue([])
    entryUpsertManyMock.mockImplementation(async () => {})
    feedUpsertManyMock.mockImplementation(async () => {})
    unreadUpdateByIdMock.mockImplementation(async () => {})
  })

  it("keeps persisted read state when a local RSS refresh returns the same entry as unread", async () => {
    const persistedReadEntry = {
      ...createPreviewEntry(true),
      insertedAt: new Date("2026-06-30T10:00:00.000Z"),
      publishedAt: new Date("2026-06-30T09:00:00.000Z"),
    } satisfies EntrySchema

    entryGetManyMock.mockResolvedValue([persistedReadEntry])
    previewMock.mockResolvedValue({
      feed: {
        id: "local-feed-x",
        title: "X.com",
        url: "https://example.com/x.xml",
        description: null,
        image: null,
        errorAt: null,
        siteUrl: "https://x.com",
        ownerUserId: null,
        errorMessage: null,
        subscriptionCount: null,
        updatesPerWeek: null,
        latestEntryPublishedAt: "2026-06-30T09:00:00.000Z",
        tipUserIds: null,
        updatedAt: "2026-06-30T10:00:00.000Z",
      },
      entries: [createPreviewEntry(false)],
    })

    const { refreshLocalRssFeed } = await import("./service")

    await refreshLocalRssFeed({
      id: "local-feed-x",
      url: "https://example.com/x.xml",
    })

    expect(entryUpsertManyMock).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "local-entry-x-post",
        read: true,
      }),
    ])
  })
})
