import { describe, expect, it } from "vitest"

import { getTopicStatus, isSameSelector, matchEntryBySelector } from "./selector"
import type { MyTopic } from "./types"

describe("matchEntryBySelector", () => {
  it("matches aiTag when the entry carries the tag", () => {
    expect(
      matchEntryBySelector({ type: "aiTag", label: "Agent 智能体" }, { title: "x" }, [
        { label: "Agent 智能体" },
      ]),
    ).toBe(true)
  })

  it("does not match aiTag when the tag is absent", () => {
    expect(
      matchEntryBySelector({ type: "aiTag", label: "Agent 智能体" }, { title: "x" }, [
        { label: "编码与开发" },
      ]),
    ).toBe(false)
    expect(matchEntryBySelector({ type: "aiTag", label: "Agent 智能体" }, { title: "x" })).toBe(
      false,
    )
  })

  it("matches keyword case-insensitively on the title", () => {
    expect(
      matchEntryBySelector(
        { type: "keyword", query: "claude" },
        { title: "New Claude release" },
        [],
      ),
    ).toBe(true)
    expect(
      matchEntryBySelector({ type: "keyword", query: "  Claude  " }, { title: "claude code" }, []),
    ).toBe(true)
  })

  it("does not match keyword when title lacks the query or query is empty", () => {
    expect(matchEntryBySelector({ type: "keyword", query: "gpt" }, { title: "claude" }, [])).toBe(
      false,
    )
    expect(matchEntryBySelector({ type: "keyword", query: "   " }, { title: "anything" }, [])).toBe(
      false,
    )
    expect(matchEntryBySelector({ type: "keyword", query: "gpt" }, { title: null }, [])).toBe(false)
  })

  it("matches keyword via semantic score when title does not contain the query", () => {
    const semanticScores = new Map<string, number>([["entry-1", 0.72]])
    expect(
      matchEntryBySelector(
        { type: "keyword", query: "智能体" },
        { title: "Building multi-step agents with tools" },
        [],
        { entryId: "entry-1", semanticScores, semanticMinScore: 0.34 },
      ),
    ).toBe(true)
    expect(
      matchEntryBySelector(
        { type: "keyword", query: "智能体" },
        { title: "Building multi-step agents with tools" },
        [],
        { entryId: "entry-2", semanticScores, semanticMinScore: 0.34 },
      ),
    ).toBe(false)
  })
})

describe("getTopicStatus", () => {
  const base: MyTopic = {
    id: "t",
    name: "t",
    selector: { type: "aiTag", label: "Agent 智能体" },
    pinned: false,
    createdAt: 0,
    lastOpenedAt: 0,
  }
  const window = 1000

  it("is active when opened within the window", () => {
    expect(getTopicStatus({ ...base, lastOpenedAt: 600 }, 1000, window)).toBe("active")
  })

  it("is dormant when opened outside the window", () => {
    expect(getTopicStatus({ ...base, lastOpenedAt: 0 }, 2000, window)).toBe("dormant")
  })

  it("is always active when pinned", () => {
    expect(getTopicStatus({ ...base, pinned: true, lastOpenedAt: 0 }, 999_999, window)).toBe(
      "active",
    )
  })
})

describe("isSameSelector", () => {
  it("compares aiTag by label and keyword by normalized query", () => {
    expect(
      isSameSelector(
        { type: "aiTag", label: "Agent 智能体" },
        { type: "aiTag", label: "Agent 智能体" },
      ),
    ).toBe(true)
    expect(
      isSameSelector(
        { type: "aiTag", label: "Agent 智能体" },
        { type: "aiTag", label: "编码与开发" },
      ),
    ).toBe(false)
    expect(
      isSameSelector({ type: "keyword", query: "GPT " }, { type: "keyword", query: "gpt" }),
    ).toBe(true)
    expect(
      isSameSelector({ type: "aiTag", label: "Agent 智能体" }, { type: "keyword", query: "Agent" }),
    ).toBe(false)
  })
})
