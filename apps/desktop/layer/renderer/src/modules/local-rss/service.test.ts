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
  triggerEntryEnrichmentFromIngestMock,
  triggerEntryRankFromIngestMock,
} = vi.hoisted(() => ({
  collectionUpsertManyMock: vi.fn(),
  entryGetManyMock: vi.fn(),
  entryStoreData: {} as Record<string, EntrySchema>,
  entryUpsertManyMock: vi.fn(),
  feedUpsertManyMock: vi.fn(),
  previewMock: vi.fn(),
  unreadUpdateByIdMock: vi.fn(),
  triggerEntryEnrichmentFromIngestMock: vi.fn(),
  triggerEntryRankFromIngestMock: vi.fn(),
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
    patch: vi.fn(),
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
  triggerEntryEnrichmentFromIngest: triggerEntryEnrichmentFromIngestMock,
  triggerEntryRankFromIngest: triggerEntryRankFromIngestMock,
}))

const feedMeta = {
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
}

const createPreviewEntry = (
  overrides: Partial<{
    id: string
    publishedAt: string
    read: boolean
  }> = {},
) => ({
  id: overrides.id ?? "local-entry-x-post",
  title: "X post",
  url: "https://x.com/example/status/1",
  content: "Post content",
  readabilityContent: null,
  readabilityUpdatedAt: null,
  description: "Post content",
  guid: overrides.id ?? "https://x.com/example/status/1",
  author: "example",
  authorUrl: null,
  authorAvatar: null,
  insertedAt: "2026-06-30T10:00:00.000Z",
  publishedAt: overrides.publishedAt ?? "2026-06-30T09:00:00.000Z",
  media: null,
  categories: null,
  attachments: null,
  extra: null,
  language: null,
  feedId: "local-feed-x",
  inboxHandle: null,
  read: overrides.read ?? false,
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
      ...createPreviewEntry({ read: true }),
      insertedAt: new Date("2026-06-30T10:00:00.000Z"),
      publishedAt: new Date("2026-06-30T09:00:00.000Z"),
    } satisfies EntrySchema

    entryGetManyMock.mockResolvedValue([persistedReadEntry])
    previewMock.mockResolvedValue({
      feed: feedMeta,
      entries: [createPreviewEntry({ read: false })],
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

  it("on initial subscription ingests full window, keeps only N unread, enriches only unread", async () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      createPreviewEntry({
        id: `entry-${i}`,
        publishedAt: new Date(Date.UTC(2026, 5, 30, 12 - i)).toISOString(),
        read: false,
      }),
    )

    previewMock.mockResolvedValue({
      feed: feedMeta,
      entries,
    })

    const { INITIAL_SUBSCRIPTION_UNREAD_COUNT, refreshLocalRssFeed } = await import("./service")

    const result = await refreshLocalRssFeed(
      { id: "local-feed-x", url: "https://example.com/x.xml" },
      { reason: "initial" },
    )

    expect(result.newlyIngestedCount).toBe(8)
    expect(entryUpsertManyMock).toHaveBeenCalledTimes(1)
    const upserted = entryUpsertManyMock.mock.calls[0]![0] as EntrySchema[]
    expect(upserted).toHaveLength(8)

    const unread = upserted.filter((e) => !e.read)
    const read = upserted.filter((e) => e.read)
    expect(unread).toHaveLength(INITIAL_SUBSCRIPTION_UNREAD_COUNT)
    expect(read).toHaveLength(8 - INITIAL_SUBSCRIPTION_UNREAD_COUNT)

    // Newest 5 by publishedAt should be unread
    const unreadIds = new Set(unread.map((e) => e.id))
    expect(unreadIds.has("entry-0")).toBe(true)
    expect(unreadIds.has("entry-4")).toBe(true)
    expect(unreadIds.has("entry-5")).toBe(false)

    expect(triggerEntryEnrichmentFromIngestMock).toHaveBeenCalledWith(
      expect.arrayContaining(["entry-0", "entry-1", "entry-2", "entry-3", "entry-4"]),
    )
    const enrichIds = triggerEntryEnrichmentFromIngestMock.mock.calls[0]![0] as string[]
    expect(enrichIds).toHaveLength(INITIAL_SUBSCRIPTION_UNREAD_COUNT)
    expect(enrichIds).not.toContain("entry-5")
  })

  it("on historyBackfill marks newly seen entries read and skips enrichment", async () => {
    // One entry already known
    entryStoreData["entry-known"] = {
      ...createPreviewEntry({ id: "entry-known", read: true }),
      insertedAt: new Date("2026-06-29T10:00:00.000Z"),
      publishedAt: new Date("2026-06-29T09:00:00.000Z"),
    } as EntrySchema

    previewMock.mockResolvedValue({
      feed: feedMeta,
      entries: [
        createPreviewEntry({ id: "entry-known", publishedAt: "2026-06-29T09:00:00.000Z" }),
        createPreviewEntry({ id: "entry-new-a", publishedAt: "2026-06-28T09:00:00.000Z" }),
        createPreviewEntry({ id: "entry-new-b", publishedAt: "2026-06-27T09:00:00.000Z" }),
      ],
    })

    const { refreshLocalRssFeed } = await import("./service")

    const result = await refreshLocalRssFeed(
      { id: "local-feed-x", url: "https://example.com/x.xml" },
      { reason: "historyBackfill" },
    )

    expect(result.newlyIngestedCount).toBe(2)
    const upserted = entryUpsertManyMock.mock.calls[0]![0] as EntrySchema[]
    const byId = Object.fromEntries(upserted.map((e) => [e.id, e]))
    expect(byId["entry-new-a"]?.read).toBe(true)
    expect(byId["entry-new-b"]?.read).toBe(true)

    expect(triggerEntryEnrichmentFromIngestMock).not.toHaveBeenCalled()
  })

  it("on refresh enriches only newly seen entries", async () => {
    entryStoreData["entry-old"] = {
      ...createPreviewEntry({ id: "entry-old", read: true }),
      insertedAt: new Date("2026-06-29T10:00:00.000Z"),
      publishedAt: new Date("2026-06-29T09:00:00.000Z"),
    } as EntrySchema

    previewMock.mockResolvedValue({
      feed: feedMeta,
      entries: [
        createPreviewEntry({ id: "entry-new", publishedAt: "2026-07-01T09:00:00.000Z" }),
        createPreviewEntry({ id: "entry-old", publishedAt: "2026-06-29T09:00:00.000Z" }),
      ],
    })

    const { refreshLocalRssFeed } = await import("./service")

    await refreshLocalRssFeed(
      { id: "local-feed-x", url: "https://example.com/x.xml" },
      { reason: "refresh" },
    )

    expect(triggerEntryEnrichmentFromIngestMock).toHaveBeenCalledWith(["entry-new"])
  })
})
