import { describe, expect, it } from "vitest"

import { scoreEntryWithTranslations, scoreKeywordMatch, sortSearchHits } from "./rank"

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

  it("falls back to description; body only when fields include content", () => {
    expect(
      scoreKeywordMatch(
        { id: "1", title: "Hello", description: "about claude", publishedAt: 0 },
        "claude",
      ),
    ).toBe(50)
    // Default library path skips full-body scan.
    expect(
      scoreKeywordMatch(
        { id: "1", title: "Hello", content: "<p>claude agent</p>", publishedAt: 0 },
        "claude",
      ),
    ).toBe(0)
    expect(
      scoreKeywordMatch(
        { id: "1", title: "Hello", content: "<p>claude agent</p>", publishedAt: 0 },
        "claude",
        { fields: "title_description_content" },
      ),
    ).toBe(20)
  })

  it("returns 0 when no field matches", () => {
    expect(scoreKeywordMatch({ id: "1", title: "Hello", publishedAt: 0 }, "claude")).toBe(0)
  })

  it("matches CJK prefix/substring in title", () => {
    // Title starts with query → prefix tier (90)
    expect(
      scoreKeywordMatch(
        { id: "1", title: "上下文卸载是一个被低估的AI应用场景", publishedAt: 0 },
        "上下文",
      ),
    ).toBe(90)
    expect(
      scoreKeywordMatch({ id: "2", title: "谈谈上下文工程的实践", publishedAt: 0 }, "上下文"),
    ).toBe(80)
  })
})

describe("scoreEntryWithTranslations", () => {
  it("matches translated Chinese title when original is English", () => {
    expect(
      scoreEntryWithTranslations(
        {
          id: "1",
          title: "Context offload: an underrated use case",
          description: "Alessio's email monitor setup",
          publishedAt: 0,
        },
        "上下文",
        {
          "zh-CN": {
            title: "上下文卸载是一个被低估的AI应用场景",
            description: null,
            content: null,
          },
        },
      ),
    ).toBe(90)
  })

  it("returns 0 when neither original nor translation matches", () => {
    expect(
      scoreEntryWithTranslations({ id: "1", title: "Hello world", publishedAt: 0 }, "上下文", {
        "zh-CN": { title: "你好世界", description: null, content: null },
      }),
    ).toBe(0)
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
