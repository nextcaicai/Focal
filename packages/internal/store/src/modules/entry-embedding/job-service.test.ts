import { describe, expect, it } from "vitest"

import { dedupeQueuePreserveOrder } from "./job-service"

describe("dedupeQueuePreserveOrder", () => {
  it("keeps first occurrence and drops later duplicates", () => {
    expect(dedupeQueuePreserveOrder(["a", "b", "a", "c", "b", "a"])).toEqual(["a", "b", "c"])
  })

  it("returns the same sequence when already unique", () => {
    expect(dedupeQueuePreserveOrder(["x", "y", "z"])).toEqual(["x", "y", "z"])
  })

  it("handles empty input", () => {
    expect(dedupeQueuePreserveOrder([])).toEqual([])
  })
})
