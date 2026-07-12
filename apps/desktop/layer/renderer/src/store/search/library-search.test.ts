import { describe, expect, it } from "vitest"

import { resolveSemanticSearchEntryIds, SEMANTIC_KEYWORD_PREFILTER_MAX } from "./library-search"

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
