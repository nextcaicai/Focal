import { describe, expect, it } from "vitest"

import { resolveAvailableUpdate } from "./use-available-update"

describe("resolveAvailableUpdate", () => {
  it("returns version for distribution updates", () => {
    expect(
      resolveAvailableUpdate({
        type: "distribution",
        status: "ready",
        distribution: "direct",
        targetUrl: "https://example.com/release",
        storeVersion: "0.2.1",
        currentVersion: "0.2.0",
      }),
    ).toEqual({ version: "0.2.1" })
  })

  it("returns null when no update status exists", () => {
    expect(resolveAvailableUpdate(null)).toBeNull()
  })
})
