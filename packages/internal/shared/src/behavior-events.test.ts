import { describe, expect, it } from "vitest"

import { BEHAVIOR_EVENT_WEIGHTS, isBehaviorEventProfileSignal } from "./behavior-events"

describe("behavior event recommendation signals", () => {
  it("keeps exposure and mark_read as audit events instead of profile signals", () => {
    expect(BEHAVIOR_EVENT_WEIGHTS.impression).toBe(0)
    expect(isBehaviorEventProfileSignal("impression")).toBe(false)
    expect(BEHAVIOR_EVENT_WEIGHTS.mark_read).toBe(0)
    expect(isBehaviorEventProfileSignal("mark_read")).toBe(false)
  })

  it("keeps real reading and explicit article actions as profile signals", () => {
    expect(isBehaviorEventProfileSignal("read_progress")).toBe(true)
    expect(isBehaviorEventProfileSignal("read_complete")).toBe(true)
    expect(isBehaviorEventProfileSignal("favorite")).toBe(true)
    expect(isBehaviorEventProfileSignal("read_later")).toBe(true)
    expect(isBehaviorEventProfileSignal("not_interested")).toBe(true)
  })
})
