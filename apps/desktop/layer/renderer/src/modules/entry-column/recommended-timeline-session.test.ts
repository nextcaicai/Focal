import { describe, expect, test } from "vitest"

import {
  applyRecommendedTimelineUpdate,
  createRecommendedTimelineSession,
  getVisibleRecommendedTimelineEntryIds,
  reconcileRecommendedTimelineSession,
} from "./recommended-timeline-session"

describe("recommended timeline session", () => {
  test("keeps the visible order stable while the Recommended route stays active", () => {
    const initial = reconcileRecommendedTimelineSession(createRecommendedTimelineSession(), {
      active: true,
      latestEntryIds: ["entry-a", "entry-b", "entry-c"],
      sourceEntryIds: ["entry-a", "entry-b", "entry-c"],
      now: 1_000,
    })

    const updated = reconcileRecommendedTimelineSession(initial, {
      active: true,
      latestEntryIds: ["entry-c", "entry-a", "entry-b"],
      sourceEntryIds: ["entry-a", "entry-b", "entry-c"],
      now: 2_000,
    })

    expect(updated.visibleEntryIds).toEqual(["entry-a", "entry-b", "entry-c"])
    expect(updated.latestEntryIds).toEqual(["entry-c", "entry-a", "entry-b"])
    expect(updated.updatePending).toBe(true)
  })

  test("applies the latest order only after the user requests an update", () => {
    const initial = reconcileRecommendedTimelineSession(createRecommendedTimelineSession(), {
      active: true,
      latestEntryIds: ["entry-a", "entry-b"],
      sourceEntryIds: ["entry-a", "entry-b"],
      now: 1_000,
    })
    const pending = reconcileRecommendedTimelineSession(initial, {
      active: true,
      latestEntryIds: ["entry-b", "entry-a"],
      sourceEntryIds: ["entry-a", "entry-b"],
      now: 2_000,
    })

    const applied = applyRecommendedTimelineUpdate(pending)

    expect(applied.visibleEntryIds).toEqual(["entry-b", "entry-a"])
    expect(applied.updatePending).toBe(false)
  })

  test("keeps a recent snapshot but refreshes it after ten minutes away", () => {
    const initial = reconcileRecommendedTimelineSession(createRecommendedTimelineSession(), {
      active: true,
      latestEntryIds: ["entry-a", "entry-b"],
      sourceEntryIds: ["entry-a", "entry-b"],
      now: 0,
    })
    const left = reconcileRecommendedTimelineSession(initial, {
      active: false,
      latestEntryIds: [],
      sourceEntryIds: [],
      now: 1_000,
    })
    const returnedEarly = reconcileRecommendedTimelineSession(left, {
      active: true,
      latestEntryIds: ["entry-b", "entry-a"],
      sourceEntryIds: ["entry-a", "entry-b"],
      now: 1_000 + 9 * 60 * 1000,
    })

    expect(returnedEarly.visibleEntryIds).toEqual(["entry-a", "entry-b"])
    expect(returnedEarly.updatePending).toBe(true)

    const leftAgain = reconcileRecommendedTimelineSession(returnedEarly, {
      active: false,
      latestEntryIds: [],
      sourceEntryIds: [],
      now: 1_000 + 9 * 60 * 1000,
    })
    const returnedAfterExpiry = reconcileRecommendedTimelineSession(leftAgain, {
      active: true,
      latestEntryIds: ["entry-b", "entry-a"],
      sourceEntryIds: ["entry-a", "entry-b"],
      now: 1_000 + 19 * 60 * 1000,
    })

    expect(returnedAfterExpiry.visibleEntryIds).toEqual(["entry-b", "entry-a"])
    expect(returnedAfterExpiry.updatePending).toBe(false)
  })

  test("shows an update only when the first thirty recommendations change", () => {
    const initialIds = Array.from({ length: 31 }, (_, index) => `entry-${index}`)
    const initial = reconcileRecommendedTimelineSession(createRecommendedTimelineSession(), {
      active: true,
      latestEntryIds: initialIds,
      sourceEntryIds: initialIds,
      now: 1_000,
    })
    const latestIds = [...initialIds]
    latestIds[30] = "entry-new"

    const updated = reconcileRecommendedTimelineSession(initial, {
      active: true,
      latestEntryIds: latestIds,
      sourceEntryIds: [...initialIds, "entry-new"],
      now: 2_000,
    })

    expect(updated.visibleEntryIds).toEqual(initialIds)
    expect(updated.updatePending).toBe(false)
  })

  test("temporarily hides dismissed entries without losing their snapshot position", () => {
    const initial = reconcileRecommendedTimelineSession(createRecommendedTimelineSession(), {
      active: true,
      latestEntryIds: ["entry-a", "entry-b", "entry-c"],
      sourceEntryIds: ["entry-a", "entry-b", "entry-c"],
      now: 1_000,
    })

    const updated = reconcileRecommendedTimelineSession(initial, {
      active: true,
      immediateRemovalEntryIds: ["entry-b"],
      latestEntryIds: ["entry-c", "entry-a"],
      sourceEntryIds: ["entry-a", "entry-b", "entry-c"],
      now: 2_000,
    })

    expect(
      getVisibleRecommendedTimelineEntryIds(updated.visibleEntryIds, {
        immediateRemovalEntryIds: ["entry-b"],
        sourceEntryIds: ["entry-a", "entry-b", "entry-c"],
      }),
    ).toEqual(["entry-a", "entry-c"])
    expect(updated.visibleEntryIds).toEqual(["entry-a", "entry-b", "entry-c"])
    expect(
      getVisibleRecommendedTimelineEntryIds(updated.visibleEntryIds, {
        immediateRemovalEntryIds: [],
        sourceEntryIds: ["entry-a", "entry-b", "entry-c"],
      }),
    ).toEqual(["entry-a", "entry-b", "entry-c"])
  })
})
