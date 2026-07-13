import { FeedViewType } from "@follow/constants"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { embeddingBatchGeneratorContext, embeddingGeneratorContext } from "../../context"
import { entryActions, useEntryStore } from "../entry/store"
import type { EntryModel } from "../entry/types"
import { entryEmbeddingSyncService, useEntryEmbeddingStore } from "./store"

const {
  deleteEmbeddingMock,
  getEntriesMetadataToHydrateMock,
  getEntryManyMock,
  recomputeForEntriesMock,
  upsertEmbeddingsMock,
} = vi.hoisted(() => ({
  deleteEmbeddingMock: vi.fn(),
  getEntriesMetadataToHydrateMock: vi.fn(),
  getEntryManyMock: vi.fn(),
  recomputeForEntriesMock: vi.fn(),
  upsertEmbeddingsMock: vi.fn(),
}))

vi.mock("@follow/database/services/entry-embedding", () => ({
  entryEmbeddingService: {
    deleteEmbedding: deleteEmbeddingMock,
    getAllEmbeddings: vi.fn(),
    reset: vi.fn(),
    upsertEmbedding: vi.fn(),
    upsertEmbeddings: upsertEmbeddingsMock,
  },
}))

vi.mock("@follow/database/services/entry", () => ({
  EntryService: {
    getEntriesMetadataToHydrate: getEntriesMetadataToHydrateMock,
    getEntryMany: getEntryManyMock,
  },
}))

vi.mock("../entry-rank-score/store", () => ({
  entryRankScoreSyncService: {
    recomputeForEntries: recomputeForEntriesMock,
  },
}))

const createEntry = (overrides?: Partial<EntryModel>): EntryModel => ({
  id: "entry-1",
  feedId: "feed-1",
  title: "Title",
  url: "https://example.com/entry-1",
  content: "<article>Current body</article>",
  readabilityContent: null,
  readabilityUpdatedAt: null,
  description: "Summary",
  guid: "entry-1",
  author: null,
  authorUrl: null,
  authorAvatar: null,
  insertedAt: new Date("2026-01-01T00:00:00.000Z"),
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
  media: null,
  categories: null,
  attachments: null,
  extra: null,
  language: null,
  inboxHandle: null,
  read: false,
  sources: null,
  settings: null,
  ...overrides,
})

describe("entryEmbeddingSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    embeddingBatchGeneratorContext.provide()
    embeddingGeneratorContext.provide()
    useEntryStore.setState({
      data: { "entry-1": createEntry() },
      entryIdByView: {
        [FeedViewType.All]: new Set(["entry-1"]),
        [FeedViewType.Articles]: new Set(["entry-1"]),
        [FeedViewType.Audios]: new Set(),
        [FeedViewType.Notifications]: new Set(),
        [FeedViewType.Pictures]: new Set(),
        [FeedViewType.SocialMedia]: new Set(),
        [FeedViewType.Videos]: new Set(),
      },
      entryIdByCategory: {},
      entryIdByFeed: { "feed-1": new Set(["entry-1"]) },
      entryIdByInbox: {},
      entryIdByList: {},
      entryIdSet: new Set(["entry-1"]),
    })
    useEntryEmbeddingStore.setState({
      data: {
        "entry-1": {
          preset: "siliconflow",
          provider: "siliconflow",
          model: "BAAI/bge-m3",
          dimension: 1,
          vector: [0.1],
          embedded_at: "2026-01-01T00:00:00.000Z",
          sourceHash: "stale-hash",
        },
      },
      hydrated: true,
    })
    getEntriesMetadataToHydrateMock.mockResolvedValue([])
    getEntryManyMock.mockResolvedValue([])
    recomputeForEntriesMock.mockResolvedValue([])
    upsertEmbeddingsMock.mockImplementation(async () => {})
  })

  test("keeps the previous embedding when regeneration fails", async () => {
    embeddingGeneratorContext.provide(vi.fn().mockRejectedValue(new Error("provider unavailable")))

    await expect(
      entryEmbeddingSyncService.generateEmbedding({ entryId: "entry-1" }),
    ).rejects.toThrow("provider unavailable")

    expect(useEntryEmbeddingStore.getState().data["entry-1"]?.vector).toEqual([0.1])
    expect(deleteEmbeddingMock).not.toHaveBeenCalled()
    expect(upsertEmbeddingsMock).not.toHaveBeenCalled()
  })

  test("keeps the previous embedding when persistence fails", async () => {
    embeddingGeneratorContext.provide(
      vi.fn().mockResolvedValue({
        preset: "siliconflow",
        provider: "siliconflow",
        model: "BAAI/bge-m3",
        dimension: 1,
        vector: [0.2],
        embedded_at: "2026-01-02T00:00:00.000Z",
      }),
    )
    upsertEmbeddingsMock.mockRejectedValue(new Error("database unavailable"))

    await expect(
      entryEmbeddingSyncService.generateEmbedding({ entryId: "entry-1" }),
    ).rejects.toThrow("database unavailable")

    expect(useEntryEmbeddingStore.getState().data["entry-1"]?.vector).toEqual([0.1])
  })

  test("uses deferred entry bodies for embedding without updating the entry store", async () => {
    const metadataEntry = createEntry({
      content: null,
      description: null,
      readabilityContent: null,
    })
    const bodyEntry = createEntry({
      content: "<article>Deferred semantic body</article>",
      description: null,
      readabilityContent: null,
    })

    getEntriesMetadataToHydrateMock.mockResolvedValue([metadataEntry])
    getEntryManyMock.mockResolvedValue([bodyEntry])
    embeddingGeneratorContext.provide(
      vi.fn().mockResolvedValue({
        preset: "siliconflow",
        provider: "siliconflow",
        model: "BAAI/bge-m3",
        dimension: 1,
        vector: [0.3],
        embedded_at: "2026-01-03T00:00:00.000Z",
      }),
    )

    await entryActions.hydrate()

    let entryStoreUpdateCount = 0
    const unsubscribe = useEntryStore.subscribe(() => {
      entryStoreUpdateCount += 1
    })

    try {
      await entryEmbeddingSyncService.generateEmbedding({ entryId: "entry-1", force: true })
    } finally {
      unsubscribe()
    }

    expect(getEntryManyMock).toHaveBeenCalledWith(["entry-1"])
    expect(upsertEmbeddingsMock).toHaveBeenCalledTimes(1)
    expect(entryStoreUpdateCount).toBe(0)
    expect(useEntryStore.getState().data["entry-1"]?.content).toBeNull()
  })
})
