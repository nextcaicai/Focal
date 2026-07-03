import { beforeEach, describe, expect, it } from "vitest"

import { createLocalStorageSnapshot, restoreLocalStorageSnapshot } from "./local-storage"

describe("storage migration localStorage snapshots", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("exports deterministic key-value snapshots", () => {
    localStorage.setItem("follow:z", "last")
    localStorage.setItem("follow:a", "first")

    const snapshot = createLocalStorageSnapshot(
      localStorage,
      () => new Date("2026-07-03T00:00:00Z"),
    )

    expect(snapshot).toEqual({
      capturedAt: "2026-07-03T00:00:00.000Z",
      entries: [
        { key: "follow:a", value: "first" },
        { key: "follow:z", value: "last" },
      ],
    })
  })

  it("restores by merging by default", () => {
    localStorage.setItem("existing", "keep")

    restoreLocalStorageSnapshot({
      capturedAt: "2026-07-03T00:00:00.000Z",
      entries: [{ key: "follow:setting", value: "value" }],
    })

    expect(localStorage.getItem("existing")).toBe("keep")
    expect(localStorage.getItem("follow:setting")).toBe("value")
  })

  it("can replace target storage when restoring into a prepared empty origin", () => {
    localStorage.setItem("stale", "remove")

    restoreLocalStorageSnapshot(
      {
        capturedAt: "2026-07-03T00:00:00.000Z",
        entries: [{ key: "follow:setting", value: "value" }],
      },
      { mode: "replace" },
    )

    expect(localStorage.getItem("stale")).toBeNull()
    expect(localStorage.getItem("follow:setting")).toBe("value")
  })
})
