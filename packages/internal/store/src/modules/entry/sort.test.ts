import { FeedViewType } from "@follow/constants"
import type { EntryQualityScoreRecord } from "@follow/shared/entry-quality-score"
import { composeRankBase } from "@follow/shared/entry-rank-score"
import { beforeEach, describe, expect, it } from "vitest"

import { useBehaviorEventStore } from "../behavior-event/store"
import { useCollectionStore } from "../collection/store"
import { useEntryQualityScoreStore } from "../entry-quality-score/store"
import { useEntryRankScoreStore } from "../entry-rank-score/store"
import { sortEntryIdsByRecommended } from "./sort"
import { useEntryStore } from "./store"
import type { EntryModel } from "./types"

const qualityRecord = (score: number): EntryQualityScoreRecord => ({
  content_types: { Tutorial: 1 },
  scores: {
    information_gain: 4,
    depth: 4,
    evidence: 4,
    actionability: 4,
    originality: 4,
    signal_density: 4,
  },
  quality_score: score,
  positive_reasons: [],
  negative_reasons: [],
  confidence: 1,
  summary: "Test summary",
})

const rankRecord = ({
  clusterId,
  now,
  score,
}: {
  clusterId?: string
  now: Date
  score: number
}) => {
  const record = composeRankBase({
    publishedAt: now,
    qualityRecord: qualityRecord(score),
    now,
  })

  return {
    ...record,
    components: {
      ...record.components,
      interest_component: clusterId ? 0.2 : 0,
      matched_positive_cluster_id: clusterId ?? null,
      matched_positive_cluster_similarity: clusterId ? 0.9 : null,
      base_score: Math.min(record.components.base_score + (clusterId ? 0.2 : 0), 1),
    },
  }
}

const entry = ({
  id,
  publishedAt,
  feedId = "feed-1",
  read = false,
}: {
  id: string
  publishedAt: string
  feedId?: string
  read?: boolean
}): EntryModel => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  content: null,
  readabilityContent: null,
  description: null,
  guid: id,
  author: null,
  authorUrl: null,
  authorAvatar: null,
  insertedAt: new Date(publishedAt),
  publishedAt: new Date(publishedAt),
  media: null,
  categories: null,
  attachments: null,
  extra: null,
  language: null,
  feedId,
  inboxHandle: null,
  read,
  sources: null,
  settings: null,
})

describe("sortEntryIdsByRecommended", () => {
  beforeEach(() => {
    useEntryStore.setState({
      data: {},
      entryIdByView: {
        [FeedViewType.All]: new Set(),
        [FeedViewType.Articles]: new Set(),
        [FeedViewType.Audios]: new Set(),
        [FeedViewType.Notifications]: new Set(),
        [FeedViewType.Pictures]: new Set(),
        [FeedViewType.SocialMedia]: new Set(),
        [FeedViewType.Videos]: new Set(),
      },
      entryIdByCategory: {},
      entryIdByFeed: {},
      entryIdByInbox: {},
      entryIdByList: {},
      entryIdSet: new Set(),
    })
    useEntryQualityScoreStore.setState({ data: {} })
    useEntryRankScoreStore.setState({ data: {} })
    useCollectionStore.setState({ collections: {} })
    useBehaviorEventStore.setState({ events: [] })
  })

  it("filters low quality, stale handled, and dismissed entries before sorting", () => {
    const now = new Date("2026-06-08T10:00:00.000Z")
    const entries = [
      entry({ id: "high", publishedAt: "2026-06-08T09:00:00.000Z" }),
      entry({ id: "low", publishedAt: "2026-06-08T09:00:00.000Z" }),
      entry({ id: "starred-yesterday", publishedAt: "2026-06-08T09:00:00.000Z" }),
      entry({ id: "read-yesterday", publishedAt: "2026-06-08T09:00:00.000Z", read: true }),
      entry({ id: "dismissed", publishedAt: "2026-06-08T09:00:00.000Z" }),
    ]

    useEntryStore.setState({
      data: Object.fromEntries(entries.map((item) => [item.id, item])),
      entryIdSet: new Set(entries.map((item) => item.id)),
    })
    useEntryQualityScoreStore.setState({
      data: {
        high: qualityRecord(80),
        low: qualityRecord(49),
        "starred-yesterday": qualityRecord(80),
        "read-yesterday": qualityRecord(80),
        dismissed: qualityRecord(80),
      },
    })
    useCollectionStore.setState({
      collections: {
        "starred-yesterday": {
          entryId: "starred-yesterday",
          feedId: "feed-1",
          view: 0,
          createdAt: "2026-06-07T10:00:00.000Z",
        },
      },
    })
    useBehaviorEventStore.setState({
      events: [
        {
          id: "read-yesterday-read_complete",
          entryId: "read-yesterday",
          eventType: "read_complete",
          createdAt: "2026-06-07T10:00:00.000Z",
        },
        {
          id: "dismissed-not_interested",
          entryId: "dismissed",
          eventType: "not_interested",
          createdAt: "2026-06-08T09:00:00.000Z",
        },
      ],
    })

    expect(
      sortEntryIdsByRecommended(
        ["low", "starred-yesterday", "read-yesterday", "dismissed", "high"],
        { now },
      ),
    ).toEqual(["high"])
  })

  it("spreads top recommended entries across feeds after rank sorting", () => {
    const now = new Date("2026-06-08T10:00:00.000Z")
    const entries = [
      entry({ id: "feed-a-1", publishedAt: now.toISOString(), feedId: "feed-a" }),
      entry({ id: "feed-a-2", publishedAt: now.toISOString(), feedId: "feed-a" }),
      entry({ id: "feed-a-3", publishedAt: now.toISOString(), feedId: "feed-a" }),
      entry({ id: "feed-b-1", publishedAt: now.toISOString(), feedId: "feed-b" }),
      entry({ id: "feed-c-1", publishedAt: now.toISOString(), feedId: "feed-c" }),
    ]
    const rankScores: Record<string, number> = {
      "feed-a-1": 90,
      "feed-a-2": 89,
      "feed-a-3": 88,
      "feed-b-1": 87,
      "feed-c-1": 86,
    }

    useEntryStore.setState({
      data: Object.fromEntries(entries.map((item) => [item.id, item])),
      entryIdSet: new Set(entries.map((item) => item.id)),
    })
    useEntryQualityScoreStore.setState({
      data: Object.fromEntries(
        entries.map((item) => [item.id, qualityRecord(rankScores[item.id] ?? 80)]),
      ),
    })
    useEntryRankScoreStore.setState({
      data: Object.fromEntries(
        entries.map((item) => [
          item.id,
          composeRankBase({
            publishedAt: item.publishedAt,
            qualityRecord: qualityRecord(rankScores[item.id] ?? 80),
            now,
          }),
        ]),
      ),
    })

    expect(
      sortEntryIdsByRecommended(
        entries.map((item) => item.id),
        { now },
      ),
    ).toEqual(["feed-a-1", "feed-b-1", "feed-c-1", "feed-a-2", "feed-a-3"])
  })

  it("spreads top recommended entries across matched interest clusters", () => {
    const now = new Date("2026-06-08T10:00:00.000Z")
    const entries = [
      entry({ id: "interest-a-1", publishedAt: now.toISOString(), feedId: "feed-1" }),
      entry({ id: "interest-a-2", publishedAt: now.toISOString(), feedId: "feed-2" }),
      entry({ id: "interest-a-3", publishedAt: now.toISOString(), feedId: "feed-3" }),
      entry({ id: "interest-b-1", publishedAt: now.toISOString(), feedId: "feed-4" }),
      entry({ id: "interest-c-1", publishedAt: now.toISOString(), feedId: "feed-5" }),
    ]
    const rankInputs: Record<string, { clusterId: string; score: number }> = {
      "interest-a-1": { clusterId: "cluster-positive", score: 90 },
      "interest-a-2": { clusterId: "cluster-positive", score: 89 },
      "interest-a-3": { clusterId: "cluster-positive", score: 88 },
      "interest-b-1": { clusterId: "cluster-positive-2", score: 87 },
      "interest-c-1": { clusterId: "cluster-positive-3", score: 86 },
    }

    useEntryStore.setState({
      data: Object.fromEntries(entries.map((item) => [item.id, item])),
      entryIdSet: new Set(entries.map((item) => item.id)),
    })
    useEntryQualityScoreStore.setState({
      data: Object.fromEntries(
        entries.map((item) => [item.id, qualityRecord(rankInputs[item.id]?.score ?? 80)]),
      ),
    })
    useEntryRankScoreStore.setState({
      data: Object.fromEntries(
        entries.map((item) => {
          const input = rankInputs[item.id]
          return [
            item.id,
            rankRecord({
              clusterId: input?.clusterId,
              now,
              score: input?.score ?? 80,
            }),
          ]
        }),
      ),
    })

    expect(
      sortEntryIdsByRecommended(
        entries.map((item) => item.id),
        { now },
      ),
    ).toEqual(["interest-a-1", "interest-b-1", "interest-c-1", "interest-a-2", "interest-a-3"])
  })
})
