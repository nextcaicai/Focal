import { describe, expect, it } from "vitest"

import type { StorylineBuildEntry } from "./engine"
import { buildStorylines, STORYLINE_WINDOW_HOURS } from "./engine"

const HOUR_MS = 60 * 60 * 1000
const NOW = 1_800_000_000_000

const entry = (
  entryId: string,
  hoursAgo: number,
  vector: number[] | null,
  feedId: string,
  title: string,
): StorylineBuildEntry => ({
  entryId,
  title,
  description: `${title} description`,
  publishedAt: NOW - hoursAgo * HOUR_MS,
  feedId,
  vector,
})

describe("buildStorylines", () => {
  it("forms a storyline from matching reports inside the 72 hour window", () => {
    const result = buildStorylines(
      [
        entry("current-a", 71, [1, 0], "feed-a", "Apple AI device update"),
        entry("current-b", 1, [0.99, 0.05], "feed-b", "Apple AI hardware update"),
      ],
      { now: NOW },
    )

    expect(STORYLINE_WINDOW_HOURS).toBe(72)
    expect(result.storylines).toHaveLength(1)
    expect(result.storylines[0]!.currentEntryIds).toEqual(["current-b", "current-a"])
    expect(result.storylines[0]!.distinctSourceCount).toBe(2)
  })

  it("links a similar older entry as history instead of a current report", () => {
    const result = buildStorylines(
      [
        entry("current-a", 3, [1, 0], "feed-a", "Apple AI device update"),
        entry("current-b", 1, [0.99, 0.05], "feed-b", "Apple AI hardware update"),
        entry("history", 73, [0.98, 0.04], "feed-c", "Apple AI device prototype"),
      ],
      { now: NOW },
    )

    expect(result.storylines[0]!.history).toEqual([expect.objectContaining({ entryId: "history" })])
  })

  it("does not publish a cluster sourced from only one feed", () => {
    const result = buildStorylines(
      [
        entry("a", 3, [1, 0], "same-feed", "Apple AI device update"),
        entry("b", 1, [0.99, 0.05], "same-feed", "Apple AI hardware update"),
      ],
      { now: NOW },
    )

    expect(result.storylines).toEqual([])
  })

  it("requires a shared title term for borderline historical similarity", () => {
    const result = buildStorylines(
      [
        entry("current-a", 3, [1, 0], "feed-a", "Apple AI device update"),
        entry("current-b", 1, [0.99, 0.05], "feed-b", "Apple AI hardware update"),
        entry("related", 100, [0.82, 0.57], "feed-c", "Apple device roadmap"),
        entry("broad", 101, [0.82, 0.57], "feed-d", "Enterprise software outlook"),
      ],
      { now: NOW, historyTau: 0.8 },
    )

    expect(result.storylines[0]!.history.map((item) => item.entryId)).toEqual(["related"])
  })

  it("keeps the title gate even when an older vector is extremely similar", () => {
    const result = buildStorylines(
      [
        entry("current-a", 3, [1, 0], "feed-a", "Apple AI device update"),
        entry("current-b", 1, [0.99, 0.05], "feed-b", "Apple AI hardware update"),
        entry("broad", 100, [1, 0], "feed-c", "Enterprise software outlook"),
      ],
      { now: NOW },
    )

    expect(result.storylines[0]!.history).toEqual([])
  })

  it("orders selected historical context chronologically", () => {
    const result = buildStorylines(
      [
        entry("current-a", 3, [1, 0], "feed-a", "Apple AI device update"),
        entry("current-b", 1, [0.99, 0.05], "feed-b", "Apple AI hardware update"),
        entry("older", 200, [0.98, 0.04], "feed-c", "Apple AI early prototype"),
        entry("newer", 100, [1, 0], "feed-d", "Apple AI recent prototype"),
      ],
      { now: NOW },
    )

    expect(result.storylines[0]!.history.map((item) => item.entryId)).toEqual(["older", "newer"])
  })

  it("reports recent embedding coverage without fabricating a storyline", () => {
    const result = buildStorylines(
      [
        entry("embedded", 2, [1, 0], "feed-a", "One report"),
        entry("missing", 1, null, "feed-b", "Another report"),
      ],
      { now: NOW },
    )

    expect(result.recentEntryCount).toBe(2)
    expect(result.embeddedRecentEntryCount).toBe(1)
    expect(result.analyzedRecentEntryCount).toBe(1)
    expect(result.storylines).toEqual([])
  })

  it("bounds recent clustering candidates and preserves total coverage", () => {
    const result = buildStorylines(
      [
        entry("oldest", 3, [1, 0], "feed-a", "Apple AI oldest update"),
        entry("middle", 2, [1, 0], "feed-b", "Apple AI middle update"),
        entry("newest", 1, [1, 0], "feed-c", "Apple AI newest update"),
      ],
      { now: NOW, maxRecentCandidates: 2 },
    )

    expect(result.recentEntryCount).toBe(3)
    expect(result.embeddedRecentEntryCount).toBe(3)
    expect(result.analyzedRecentEntryCount).toBe(2)
    expect(result.storylines[0]!.currentEntryIds).toEqual(["newest", "middle"])
  })
})
