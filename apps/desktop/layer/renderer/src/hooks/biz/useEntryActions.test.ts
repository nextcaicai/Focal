import { describe, expect, test } from "vitest"

import { hasNotInterestedBehaviorEvent, hasReadLaterBehaviorEvent } from "./entry-behavior-events"

describe("hasNotInterestedBehaviorEvent", () => {
  test("returns true when the entry has a not interested event", () => {
    expect(
      hasNotInterestedBehaviorEvent(
        [
          {
            entryId: "entry-1",
            eventType: "not_interested",
          },
        ],
        "entry-1",
      ),
    ).toBe(true)
  })

  test("ignores other entries and other behavior events", () => {
    expect(
      hasNotInterestedBehaviorEvent(
        [
          {
            entryId: "entry-2",
            eventType: "not_interested",
          },
          {
            entryId: "entry-1",
            eventType: "favorite",
          },
        ],
        "entry-1",
      ),
    ).toBe(false)
  })
})

describe("hasReadLaterBehaviorEvent", () => {
  test("returns true when the entry has a read later event", () => {
    expect(
      hasReadLaterBehaviorEvent(
        [
          {
            entryId: "entry-1",
            eventType: "read_later",
          },
        ],
        "entry-1",
      ),
    ).toBe(true)
  })

  test("ignores other entries and other behavior events", () => {
    expect(
      hasReadLaterBehaviorEvent(
        [
          {
            entryId: "entry-2",
            eventType: "read_later",
          },
          {
            entryId: "entry-1",
            eventType: "favorite",
          },
        ],
        "entry-1",
      ),
    ).toBe(false)
  })
})
