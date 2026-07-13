import { describe, expect, it } from "vitest"

import {
  applyEntityLookupDescriptionCap,
  ENTITY_LOOKUP_DESCRIPTION_MAX,
  KEYWORD_MATCH_DESCRIPTION_SCORE,
  resolveMinQueryLengthForSearch,
  resolveSemanticSearchEntryIds,
  SEMANTIC_KEYWORD_PREFILTER_MAX,
  shouldRunLibrarySemanticSearch,
} from "./library-search"

describe("resolveMinQueryLengthForSearch", () => {
  it("requires at least 2 latin characters", () => {
    expect(resolveMinQueryLengthForSearch("c")).toBe(2)
    expect(resolveMinQueryLengthForSearch("ch")).toBe(2)
  })

  it("allows single CJK character", () => {
    expect(resolveMinQueryLengthForSearch("华")).toBe(1)
  })
})

describe("shouldRunLibrarySemanticSearch", () => {
  it("skips semantic when there are no keyword hits", () => {
    expect(shouldRunLibrarySemanticSearch("mi'ni", 0, true)).toBe(false)
    expect(shouldRunLibrarySemanticSearch("mannager", 0, true)).toBe(false)
    expect(shouldRunLibrarySemanticSearch("memoriiiiiii", 0, true)).toBe(false)
  })

  it("runs semantic when keyword hits exist for non-entity queries", () => {
    expect(shouldRunLibrarySemanticSearch("neural network basics", 10, true)).toBe(true)
  })

  it("skips semantic for entity lookup queries even with keyword hits", () => {
    expect(shouldRunLibrarySemanticSearch("codex", 10, true)).toBe(false)
    expect(shouldRunLibrarySemanticSearch("华为", 10, true)).toBe(false)
  })

  it("does not run semantic without query vector", () => {
    expect(shouldRunLibrarySemanticSearch("chatgpt", 5, false)).toBe(false)
  })
})

describe("applyEntityLookupDescriptionCap", () => {
  const baseHit = (entryId: string, matchScore: number) => ({
    entryId,
    matchScore,
    publishedAt: new Date("2026-01-01"),
    qualityScore: null as number | null,
  })

  it("caps description-only hits for entity lookups", () => {
    const keywordScores = new Map<string, number>()
    const hits: Array<ReturnType<typeof baseHit>> = []
    for (let i = 0; i < 30; i++) {
      const id = `desc-${i}`
      keywordScores.set(id, KEYWORD_MATCH_DESCRIPTION_SCORE)
      hits.push(baseHit(id, KEYWORD_MATCH_DESCRIPTION_SCORE))
    }
    keywordScores.set("title-1", 90)
    hits.push(baseHit("title-1", 90))

    const capped = applyEntityLookupDescriptionCap("codex", hits, keywordScores)
    expect(capped).toHaveLength(ENTITY_LOOKUP_DESCRIPTION_MAX + 1)
    expect(capped.some((hit) => hit.entryId === "title-1")).toBe(true)
  })

  it("does not cap non-entity queries", () => {
    const keywordScores = new Map([["a", KEYWORD_MATCH_DESCRIPTION_SCORE]])
    const hits = [baseHit("a", KEYWORD_MATCH_DESCRIPTION_SCORE)]
    expect(applyEntityLookupDescriptionCap("neural network basics", hits, keywordScores)).toEqual(
      hits,
    )
  })
})

describe("resolveSemanticSearchEntryIds", () => {
  it("returns undefined when no keyword hits (semantic off)", () => {
    expect(resolveSemanticSearchEntryIds(new Map())).toBeUndefined()
    expect(resolveSemanticSearchEntryIds(new Map([["a", 0]]))).toBeUndefined()
  })

  it("returns keyword hit ids when under the cap", () => {
    const scope = resolveSemanticSearchEntryIds(
      new Map([
        ["b", 50],
        ["a", 80],
      ]),
    )
    expect(scope).toEqual(new Set(["a", "b"]))
  })

  it("caps semantic scope to top keyword scores", () => {
    const scores = new Map<string, number>()
    for (let i = 0; i < SEMANTIC_KEYWORD_PREFILTER_MAX + 10; i++) {
      scores.set(`entry-${i}`, i + 1)
    }

    const scope = resolveSemanticSearchEntryIds(scores)
    expect(scope?.size).toBe(SEMANTIC_KEYWORD_PREFILTER_MAX)
    expect(scope?.has(`entry-${SEMANTIC_KEYWORD_PREFILTER_MAX + 9}`)).toBe(true)
    expect(scope?.has("entry-0")).toBe(false)
  })
})
