import { FeedViewType } from "@follow/constants"
import { updateInterestCluster } from "@follow/shared/interest-profile"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useEntryStore } from "../entry/store"
import type { EntryModel } from "../entry/types"
import { useEntryEmbeddingStore } from "../entry-embedding/store"
import { useEntryQualityScoreStore } from "../entry-quality-score/store"
import { useInterestClusterStore } from "../interest-cluster/store"
import { entryRankScoreSyncService, useEntryRankScoreStore } from "./store"

const { upsertScoreMock } = vi.hoisted(() => ({
  upsertScoreMock: vi.fn(),
}))

vi.mock("@follow/database/services/entry-rank-score", () => ({
  entryRankScoreService: {
    getAllScores: vi.fn(),
    reset: vi.fn(),
    upsertScore: upsertScoreMock,
  },
}))

const createEntry = (id: string): EntryModel => ({
  id,
  feedId: "feed-1",
  title: id,
  url: `https://example.com/${id}`,
  content: null,
  readabilityContent: null,
  readabilityUpdatedAt: null,
  description: null,
  guid: id,
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
})

describe("entryRankScoreSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useEntryStore.setState({
      data: {
        "entry-1": createEntry("entry-1"),
        "entry-2": createEntry("entry-2"),
      },
      entryIdByView: {
        [FeedViewType.All]: new Set(["entry-1", "entry-2"]),
        [FeedViewType.Articles]: new Set(["entry-1", "entry-2"]),
        [FeedViewType.Audios]: new Set(),
        [FeedViewType.Notifications]: new Set(),
        [FeedViewType.Pictures]: new Set(),
        [FeedViewType.SocialMedia]: new Set(),
        [FeedViewType.Videos]: new Set(),
      },
      entryIdByCategory: {},
      entryIdByFeed: { "feed-1": new Set(["entry-1", "entry-2"]) },
      entryIdByInbox: {},
      entryIdByList: {},
      entryIdSet: new Set(["entry-1", "entry-2"]),
    })
    useEntryQualityScoreStore.setState({ data: {} })
    useEntryEmbeddingStore.setState({ data: {}, hydrated: true })
    useInterestClusterStore.setState({ data: {} })
    useEntryRankScoreStore.setState({ data: {} })
  })

  it("batches visible entry rank recomputation into one store update", async () => {
    let updateCount = 0
    const unsubscribe = useEntryRankScoreStore.subscribe(() => {
      updateCount += 1
    })

    try {
      await entryRankScoreSyncService.recomputeForEntries(["entry-1", "entry-2"], {
        force: true,
      })
    } finally {
      unsubscribe()
    }

    expect(Object.keys(useEntryRankScoreStore.getState().data)).toEqual(["entry-1", "entry-2"])
    expect(updateCount).toBe(1)
    expect(upsertScoreMock).toHaveBeenCalledTimes(2)
  })

  it("stores the matched positive interest cluster on recomputed rank records", async () => {
    const cluster = updateInterestCluster({
      cluster: null,
      id: "cluster-positive-2",
      vector: [1, 0],
      eventType: "favorite",
    })

    useInterestClusterStore.setState({
      data: {
        [cluster.id]: cluster,
      },
    })
    useEntryEmbeddingStore.setState({
      data: {
        "entry-1": {
          preset: "custom",
          provider: "test",
          model: "test",
          dimension: 2,
          vector: [1, 0],
          embedded_at: "2026-01-01T00:00:00.000Z",
        },
      },
      hydrated: true,
    })

    await entryRankScoreSyncService.recomputeForEntry("entry-1", { force: true })

    expect(
      useEntryRankScoreStore.getState().data["entry-1"]?.components.matched_positive_cluster_id,
    ).toBe("cluster-positive-2")
  })
})
