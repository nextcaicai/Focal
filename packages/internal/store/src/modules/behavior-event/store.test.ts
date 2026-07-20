import { describe, expect, test } from "vitest"

import {
  readProgressTier,
  removeBehaviorEvents,
  shouldRecordImpressionEvent,
  shouldRecordOpenEvent,
} from "./store"

describe("removeBehaviorEvents", () => {
  test("removes only matching events for the entry and event type", () => {
    const events = [
      {
        id: "target-not-interested",
        entryId: "entry-1",
        eventType: "not_interested" as const,
        createdAt: "2026-06-15T00:00:00.000Z",
      },
      {
        id: "other-entry-not-interested",
        entryId: "entry-2",
        eventType: "not_interested" as const,
        createdAt: "2026-06-15T00:00:00.000Z",
      },
      {
        id: "target-favorite",
        entryId: "entry-1",
        eventType: "favorite" as const,
        metadata: {
          source: "command" as const,
        },
        createdAt: "2026-06-15T00:00:00.000Z",
      },
    ]

    expect(removeBehaviorEvents(events, "entry-1", "not_interested")).toEqual([
      events[1],
      events[2],
    ])
  })
})

describe("readProgressTier", () => {
  test("normalizes read progress to stable recommendation signal thresholds", () => {
    expect(readProgressTier(0.1)).toBeNull()
    expect(readProgressTier(0.25)).toBe(0.25)
    expect(readProgressTier(0.49)).toBe(0.25)
    expect(readProgressTier(0.5)).toBe(0.5)
    expect(readProgressTier(0.74)).toBe(0.5)
    expect(readProgressTier(0.75)).toBe(0.75)
    expect(readProgressTier(1)).toBe(0.75)
  })
})

describe("shouldRecordOpenEvent", () => {
  test("dedupes recent open events for the same entry", () => {
    const now = new Date("2026-06-15T00:05:00.000Z")
    const events = [
      {
        id: "recent-open",
        entryId: "entry-1",
        eventType: "open" as const,
        createdAt: "2026-06-15T00:01:00.000Z",
      },
      {
        id: "old-open",
        entryId: "entry-2",
        eventType: "open" as const,
        createdAt: "2026-06-15T00:00:00.000Z",
      },
    ]

    expect(shouldRecordOpenEvent(events, "entry-1", now)).toBe(false)
    expect(shouldRecordOpenEvent(events, "entry-2", now)).toBe(true)
    expect(shouldRecordOpenEvent(events, "entry-3", now)).toBe(true)
  })
})

describe("shouldRecordImpressionEvent", () => {
  test("dedupes recent recommendation impressions for the same entry", () => {
    const now = new Date("2026-06-15T06:00:00.000Z")
    const events = [
      {
        id: "recent-impression",
        entryId: "entry-1",
        eventType: "impression" as const,
        createdAt: "2026-06-15T01:00:00.000Z",
      },
      {
        id: "old-impression",
        entryId: "entry-2",
        eventType: "impression" as const,
        createdAt: "2026-06-14T23:00:00.000Z",
      },
    ]

    expect(shouldRecordImpressionEvent(events, "entry-1", now)).toBe(false)
    expect(shouldRecordImpressionEvent(events, "entry-2", now)).toBe(true)
    expect(shouldRecordImpressionEvent(events, "entry-3", now)).toBe(true)
  })
})
