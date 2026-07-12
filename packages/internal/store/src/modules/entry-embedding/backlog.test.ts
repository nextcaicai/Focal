import { FeedViewType } from "@follow/constants"
import { EntryService } from "@follow/database/services/entry"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { entryActions, useEntryStore } from "../entry/store"
import type { EntryModel } from "../entry/types"
import { useSubscriptionStore } from "../subscription/store"
import { entryNeedsEmbedding, getEmbeddingCoverageStats } from "./backlog"
import { hashEmbeddingSourceText } from "./source-text"
import { useEntryEmbeddingStore } from "./store"

const createEntry = (id: string, overrides: Partial<EntryModel> = {}): EntryModel =>
  ({
    id,
    guid: `${id}-guid`,
    insertedAt: new Date("2026-01-01T00:00:00.000Z"),
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    feedId: "feed-a",
    title: "Title",
    description: "Summary",
    ...overrides,
  }) as EntryModel

const createEmptyViewSets = () => ({
  [FeedViewType.All]: new Set<string>(),
  [FeedViewType.Articles]: new Set<string>(),
  [FeedViewType.Audios]: new Set<string>(),
  [FeedViewType.Notifications]: new Set<string>(),
  [FeedViewType.Pictures]: new Set<string>(),
  [FeedViewType.SocialMedia]: new Set<string>(),
  [FeedViewType.Videos]: new Set<string>(),
})

describe("embedding backlog", () => {
  beforeEach(async () => {
    vi.restoreAllMocks()
    vi.spyOn(EntryService, "getEntriesMetadataToHydrate").mockResolvedValue([])
    await entryActions.hydrate()

    useSubscriptionStore.setState({
      data: {
        "feed-a": {
          feedId: "feed-a",
          listId: null,
          inboxId: null,
          userId: "user",
          view: FeedViewType.Articles,
          isPrivate: false,
          hideFromTimeline: null,
          title: null,
          category: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
          type: "feed",
        },
      },
      feedIdByView: {
        ...createEmptyViewSets(),
        [FeedViewType.All]: new Set(["feed-a"]),
        [FeedViewType.Articles]: new Set(["feed-a"]),
      },
      listIdByView: createEmptyViewSets(),
      categories: createEmptyViewSets(),
      subscriptionIdSet: new Set(["feed-a"]),
      categoryOpenStateByView: {
        [FeedViewType.All]: {},
        [FeedViewType.Articles]: {},
        [FeedViewType.Audios]: {},
        [FeedViewType.Notifications]: {},
        [FeedViewType.Pictures]: {},
        [FeedViewType.SocialMedia]: {},
        [FeedViewType.Videos]: {},
      },
    })
    useEntryStore.setState({
      data: {
        "entry-missing": createEntry("entry-missing"),
        "entry-covered": createEntry("entry-covered"),
        "entry-read": createEntry("entry-read", { read: true }),
      },
    })
    useEntryEmbeddingStore.setState({
      data: {
        "entry-covered": {
          preset: "siliconflow",
          provider: "siliconflow",
          model: "BAAI/bge-m3",
          dimension: 1024,
          vector: [0.1],
          embedded_at: "2026-01-01T00:00:00.000Z",
          sourceHash: "deadbeef",
        },
      },
    })
  })

  test("counts missing and stale unread entries as backlog; skips ingest-premarked read", () => {
    expect(entryNeedsEmbedding("entry-missing")).toBe(true)
    // Covered row has a stale sourceHash in fixtures → still needs re-embed.
    expect(entryNeedsEmbedding("entry-covered")).toBe(true)
    expect(entryNeedsEmbedding("entry-read")).toBe(false)

    const stats = getEmbeddingCoverageStats(() => false)
    expect(stats.eligibleCount).toBe(2)
    expect(stats.backlogCount).toBe(2)
    expect(stats.coveredCount).toBe(0)
  })

  test("keeps a full-body embedding covered while the entry body is deferred", async () => {
    const fullEntry = {
      attachments: null,
      author: null,
      authorAvatar: null,
      authorUrl: null,
      categories: null,
      content: "<article>Full body</article>",
      description: "Summary",
      extra: null,
      feedId: "feed-a",
      guid: "entry-deferred-guid",
      id: "entry-deferred",
      inboxHandle: null,
      insertedAt: new Date("2026-01-01T00:00:00.000Z"),
      language: null,
      media: null,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      read: false,
      readabilityContent: "<article>Full body</article>",
      readabilityUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      settings: null,
      sources: null,
      title: "Title",
      url: null,
    } satisfies Awaited<ReturnType<typeof EntryService.getEntriesMetadataToHydrate>>[number]
    vi.mocked(EntryService.getEntriesMetadataToHydrate).mockResolvedValue([fullEntry])

    await entryActions.hydrate()
    useEntryStore.setState({
      data: { "entry-deferred": useEntryStore.getState().data["entry-deferred"]! },
    })
    const fullBodyEmbedding = {
      preset: "siliconflow" as const,
      provider: "siliconflow",
      model: "BAAI/bge-m3",
      dimension: 1024,
      vector: [0.1],
      embedded_at: "2026-01-01T00:00:00.000Z",
      sourceHash: hashEmbeddingSourceText("Title\n\nSummary\n\nFull body"),
    }
    useEntryEmbeddingStore.setState({ data: { "entry-deferred": fullBodyEmbedding } })

    expect(entryNeedsEmbedding("entry-deferred")).toBe(false)
    expect(getEmbeddingCoverageStats(() => false)).toMatchObject({
      backlogCount: 0,
      coveredCount: 1,
    })

    const { sourceHash: _, ...hashlessEmbedding } = fullBodyEmbedding
    useEntryEmbeddingStore.setState({ data: { "entry-deferred": hashlessEmbedding } })
    expect(entryNeedsEmbedding("entry-deferred")).toBe(true)

    useEntryEmbeddingStore.setState({ data: { "entry-deferred": fullBodyEmbedding } })

    entryActions.updateEntryContentInSession({
      entryId: "entry-deferred",
      content: "<article>Changed body</article>",
    })

    expect(entryNeedsEmbedding("entry-deferred")).toBe(true)
  })

  test("queues a deferred body-only entry when its embedding is missing", async () => {
    const bodyOnlyEntry = {
      attachments: null,
      author: null,
      authorAvatar: null,
      authorUrl: null,
      categories: null,
      content: "<article>Body only</article>",
      description: null,
      extra: null,
      feedId: "feed-a",
      guid: "entry-body-only-guid",
      id: "entry-body-only",
      inboxHandle: null,
      insertedAt: new Date("2026-01-01T00:00:00.000Z"),
      language: null,
      media: null,
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
      read: false,
      readabilityContent: null,
      readabilityUpdatedAt: null,
      settings: null,
      sources: null,
      title: null,
      url: null,
    } satisfies Awaited<ReturnType<typeof EntryService.getEntriesMetadataToHydrate>>[number]
    vi.mocked(EntryService.getEntriesMetadataToHydrate).mockResolvedValue([bodyOnlyEntry])

    await entryActions.hydrate()
    useEntryStore.setState({
      data: { "entry-body-only": useEntryStore.getState().data["entry-body-only"]! },
    })
    useEntryEmbeddingStore.setState({ data: {} })

    expect(entryNeedsEmbedding("entry-body-only")).toBe(true)
    expect(getEmbeddingCoverageStats(() => false)).toMatchObject({
      backlogCount: 1,
      eligibleCount: 1,
    })
  })
})
