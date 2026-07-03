import { describe, expect, it } from "vitest"

import {
  FOCAL_BUNDLE_ID,
  FOCAL_STAGING_BUNDLE_ID,
  getFocalAppUserModelId,
  getFocalBundleId,
} from "./app-identity"

describe("desktop app identity", () => {
  it("uses a Focal-specific bundle id instead of the legacy Follow id", () => {
    expect(FOCAL_BUNDLE_ID).toBe("com.nextcaicai.focal")
    expect(FOCAL_STAGING_BUNDLE_ID).toBe("com.nextcaicai.focal.staging")
    expect(getFocalBundleId()).toBe("com.nextcaicai.focal")
    expect(getFocalBundleId(true)).toBe("com.nextcaicai.focal.staging")
    expect(getFocalAppUserModelId()).toBe("com.nextcaicai.focal")
    expect(getFocalBundleId()).not.toBe("is.follow")
  })
})
