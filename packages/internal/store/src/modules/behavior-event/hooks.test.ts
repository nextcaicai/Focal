import { describe, expect, test } from "vitest"

import { getEntryIdsByBehaviorEventType } from "./hooks"
import type { BehaviorEvent } from "./store"

describe("getEntryIdsByBehaviorEventType", () => {
  test("returns latest matching entry ids by event time", () => {
    const events: BehaviorEvent[] = [
      {
        id: "entry-1-old",
        entryId: "entry-1",
        eventType: "read_later",
        createdAt: "2026-07-10T00:00:00.000Z",
      },
      {
        id: "entry-2-favorite",
        entryId: "entry-2",
        eventType: "favorite",
        createdAt: "2026-07-12T00:00:00.000Z",
      },
      {
        id: "entry-3-read-later",
        entryId: "entry-3",
        eventType: "read_later",
        createdAt: "2026-07-11T00:00:00.000Z",
      },
      {
        id: "entry-1-new",
        entryId: "entry-1",
        eventType: "read_later",
        createdAt: "2026-07-13T00:00:00.000Z",
      },
    ]

    expect(getEntryIdsByBehaviorEventType(events, "read_later")).toEqual(["entry-1", "entry-3"])
  })
})
