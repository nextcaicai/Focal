import { describe, expect, it } from "vitest"

import {
  LIBRARY_SEARCH_MIN_SEMANTIC_QUERY_LEN,
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
  it("skips semantic when there are no keyword hits and query is short", () => {
    expect(shouldRunLibrarySemanticSearch("mi'ni", 0, true)).toBe(false)
    expect(shouldRunLibrarySemanticSearch("mannager", 0, true)).toBe(false)
  })

  it("runs semantic for long paraphrase queries without keyword hits", () => {
    const longQuery = "a".repeat(LIBRARY_SEARCH_MIN_SEMANTIC_QUERY_LEN)
    expect(shouldRunLibrarySemanticSearch(longQuery, 0, true)).toBe(true)
  })

  it("runs semantic when keyword hits exist", () => {
    expect(shouldRunLibrarySemanticSearch("c", 10, true)).toBe(true)
  })

  it("does not run semantic without query vector", () => {
    expect(shouldRunLibrarySemanticSearch("chatgpt", 5, false)).toBe(false)
  })
})

describe("resolveSemanticSearchEntryIds", () => {
  it("returns undefined when no keyword hits (full semantic scan)", () => {
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
