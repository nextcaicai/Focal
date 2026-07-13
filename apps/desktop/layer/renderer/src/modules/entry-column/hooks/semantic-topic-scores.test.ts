import { beforeEach, describe, expect, it } from "vitest"

import {
  clearKeywordTopicSemanticScoreCacheForTest,
  getKeywordTopicSemanticScoresSnapshot,
} from "./semantic-topic-scores"

describe("getKeywordTopicSemanticScoresSnapshot", () => {
  beforeEach(() => {
    clearKeywordTopicSemanticScoreCacheForTest()
  })

  it("keeps a stable semantic topic snapshot while the refresh key is unchanged", () => {
    const first = getKeywordTopicSemanticScoresSnapshot({
      query: "ai agents",
      queryVector: [1, 0],
      embeddings: {
        "entry-1": { vector: [1, 0] },
      },
      refreshKey: 1,
    })

    const second = getKeywordTopicSemanticScoresSnapshot({
      query: "ai agents",
      queryVector: [1, 0],
      embeddings: {
        "entry-1": { vector: [1, 0] },
        "entry-2": { vector: [1, 0] },
      },
      refreshKey: 1,
    })

    expect(second).toBe(first)
    expect(second?.has("entry-2")).toBe(false)
  })

  it("refreshes the semantic topic snapshot when the refresh key advances", () => {
    getKeywordTopicSemanticScoresSnapshot({
      query: "ai agents",
      queryVector: [1, 0],
      embeddings: {
        "entry-1": { vector: [1, 0] },
      },
      refreshKey: 1,
    })

    const refreshed = getKeywordTopicSemanticScoresSnapshot({
      query: "ai agents",
      queryVector: [1, 0],
      embeddings: {
        "entry-1": { vector: [1, 0] },
        "entry-2": { vector: [1, 0] },
      },
      refreshKey: 2,
    })

    expect(refreshed?.has("entry-2")).toBe(true)
  })
})
