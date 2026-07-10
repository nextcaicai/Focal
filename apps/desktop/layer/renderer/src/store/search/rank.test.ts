import { describe, expect, it } from "vitest"

import { scoreKeywordMatch, sortSearchHits } from "./rank"

describe("scoreKeywordMatch", () => {
  it("ranks title exact highest", () => {
    expect(scoreKeywordMatch({ id: "1", title: "Claude", publishedAt: 0 }, "claude")).toBe(100)
  })

  it("ranks title prefix above contains", () => {
    const prefix = scoreKeywordMatch(
      { id: "1", title: "Claude Code tips", publishedAt: 0 },
      "claude",
    )
    const contains = scoreKeywordMatch(
      { id: "2", title: "Using Claude daily", publishedAt: 0 },
      "claude",
    )
    expect(prefix).toBe(90)
    expect(contains).toBe(80)
    expect(prefix).toBeGreaterThan(contains)
  })

  it("falls back to description then content", () => {
    expect(
      scoreKeywordMatch(
        { id: "1", title: "Hello", description: "about claude", publishedAt: 0 },
        "claude",
      ),
    ).toBe(50)
    expect(
      scoreKeywordMatch(
        { id: "1", title: "Hello", content: "<p>claude agent</p>", publishedAt: 0 },
        "claude",
      ),
    ).toBe(20)
  })

  it("returns 0 when no field matches", () => {
    expect(scoreKeywordMatch({ id: "1", title: "Hello", publishedAt: 0 }, "claude")).toBe(0)
  })
})

describe("sortSearchHits", () => {
  const base = [
    {
      entryId: "a",
      matchScore: 50,
      publishedAt: new Date("2026-01-02"),
      qualityScore: 90 as number | null,
    },
    {
      entryId: "b",
      matchScore: 80,
      publishedAt: new Date("2026-01-01"),
      qualityScore: 10 as number | null,
    },
    {
      entryId: "c",
      matchScore: 80,
      publishedAt: new Date("2026-01-03"),
      qualityScore: null as number | null,
    },
  ]

  it("relevance: match first, then time, then quality", () => {
    // b and c same match 80; c newer → first among them; a lower match last
    expect(sortSearchHits(base, "relevance")).toEqual(["c", "b", "a"])
  })

  it("latest: time only", () => {
    expect(sortSearchHits(base, "latest")).toEqual(["c", "a", "b"])
  })

  it("quality breaks ties when match and time equal", () => {
    const ties = [
      {
        entryId: "low",
        matchScore: 80,
        publishedAt: new Date("2026-01-01"),
        qualityScore: 10 as number | null,
      },
      {
        entryId: "high",
        matchScore: 80,
        publishedAt: new Date("2026-01-01"),
        qualityScore: 90 as number | null,
      },
      {
        entryId: "none",
        matchScore: 80,
        publishedAt: new Date("2026-01-01"),
        qualityScore: null as number | null,
      },
    ]
    const order = sortSearchHits(ties, "relevance")
    expect(order[0]).toBe("high")
    expect(order[1]).toBe("low")
    // null quality is neutral — stays after scored when scores differ; with equal time/match,
    // null vs number: implementation treats null as neutral (return 0 vs other)
    expect(order).toContain("none")
  })
})
