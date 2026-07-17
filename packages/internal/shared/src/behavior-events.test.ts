import { describe, expect, it } from "vitest"

import { BEHAVIOR_EVENT_WEIGHTS, isBehaviorEventProfileSignal } from "./behavior-events"

describe("behavior event recommendation signals", () => {
  it("keeps mark_read as an audit event instead of a profile signal", () => {
    expect(BEHAVIOR_EVENT_WEIGHTS.mark_read).toBe(0)
    expect(isBehaviorEventProfileSignal("mark_read")).toBe(false)
  })

  it("keeps real reading and explicit article actions as profile signals", () => {
    expect(isBehaviorEventProfileSignal("read_progress")).toBe(true)
    expect(isBehaviorEventProfileSignal("read_complete")).toBe(true)
    expect(isBehaviorEventProfileSignal("favorite")).toBe(true)
    expect(isBehaviorEventProfileSignal("not_interested")).toBe(true)
  })
})
