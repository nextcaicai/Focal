import type { EntryEmbeddingRecord } from "@follow/shared/entry-embedding"
import { describe, expect, it } from "vitest"

import {
  buildSemanticScoreByEntryId,
  collectSemanticHits,
  combineSearchMatchScore,
  entryMatchesSemanticQuery,
  resolveSemanticStandaloneMinScore,
  SEMANTIC_SEARCH_MIN_SCORE,
  semanticCosineToMatchPoints,
} from "./semantic-search"

const emb = (vector: number[]): EntryEmbeddingRecord => ({
  preset: "siliconflow",
  provider: "siliconflow",
  model: "BAAI/bge-m3",
  dimension: vector.length,
  vector,
  embedded_at: "2026-01-01T00:00:00.000Z",
})

describe("resolveSemanticStandaloneMinScore", () => {
  it("raises the floor for short CJK entity queries", () => {
    expect(resolveSemanticStandaloneMinScore("华为")).toBe(0.58)
    expect(resolveSemanticStandaloneMinScore("智能体")).toBe(0.58)
  })

  it("raises the floor for short Latin tokens", () => {
    expect(resolveSemanticStandaloneMinScore("RAG")).toBe(0.55)
    expect(resolveSemanticStandaloneMinScore("MCP")).toBe(0.55)
  })

  it("is looser for longer natural-language queries", () => {
    expect(resolveSemanticStandaloneMinScore("how to build multi-agent workflows")).toBe(0.45)
  })
})

describe("semanticCosineToMatchPoints", () => {
  it("returns 0 below the floor", () => {
    expect(semanticCosineToMatchPoints(SEMANTIC_SEARCH_MIN_SCORE - 0.01)).toBe(0)
  })

  it("maps floor to ~40 and 1.0 near the top of the band", () => {
    expect(semanticCosineToMatchPoints(SEMANTIC_SEARCH_MIN_SCORE)).toBe(40)
    expect(semanticCosineToMatchPoints(1)).toBe(92)
  })
})

describe("combineSearchMatchScore", () => {
  it("always keeps keyword hits even when semantic is weak", () => {
    expect(combineSearchMatchScore(80, 0.2, 0.58)).toBe(80)
    expect(combineSearchMatchScore(20, null, 0.58)).toBe(20)
  })

  it("rejects pure-semantic hits below the standalone floor", () => {
    expect(combineSearchMatchScore(0, 0.4, 0.58)).toBe(0)
    expect(combineSearchMatchScore(0, 0.5, 0.48)).toBeGreaterThan(0)
  })

  it("prefers the stronger of keyword and strong semantic", () => {
    expect(combineSearchMatchScore(0, 0.9, 0.48)).toBeGreaterThan(0)
    expect(combineSearchMatchScore(100, 0.9, 0.48)).toBe(100)
  })
})

describe("collectSemanticHits", () => {
  it("returns empty without a query vector", () => {
    expect(collectSemanticHits(null, { a: emb([1, 0]) })).toEqual([])
    expect(collectSemanticHits([], { a: emb([1, 0]) })).toEqual([])
  })

  it("ranks by cosine and drops below minScore or dimension mismatch", () => {
    const embeddings = {
      close: emb([1, 0]),
      mid: emb([0.7, 0.7]),
      far: emb([0, 1]),
      badDim: emb([1, 0, 0]),
    }

    const hits = collectSemanticHits([1, 0], embeddings, { minScore: 0.5 })
    expect(hits.map((h) => h.entryId)).toEqual(["close", "mid"])
    expect(hits[0]!.cosine).toBeGreaterThan(hits[1]!.cosine)
  })

  it("respects limit", () => {
    const embeddings = {
      a: emb([1, 0]),
      b: emb([0.99, 0.1]),
      c: emb([0.9, 0.2]),
    }
    expect(collectSemanticHits([1, 0], embeddings, { minScore: 0.1, limit: 2 })).toHaveLength(2)
  })
})

describe("buildSemanticScoreByEntryId / entryMatchesSemanticQuery", () => {
  it("builds a lookup map and membership check", () => {
    const embeddings = {
      a: emb([1, 0]),
      b: emb([0, 1]),
    }
    const map = buildSemanticScoreByEntryId([1, 0], embeddings, { minScore: 0.5 })
    expect(map.has("a")).toBe(true)
    expect(map.has("b")).toBe(false)
    expect(entryMatchesSemanticQuery("a", map, 0.5)).toBe(true)
    expect(entryMatchesSemanticQuery("b", map, 0.5)).toBe(false)
    expect(entryMatchesSemanticQuery("a", null)).toBe(false)
  })
})
