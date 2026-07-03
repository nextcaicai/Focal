import { describe, expect, it } from "vitest"

import { isOnboardingEntryUrl, isOnboardingFeedUrl } from "./onboarding"

describe("onboarding URL sentinels", () => {
  it("recognizes only focal onboarding URLs", () => {
    expect(isOnboardingEntryUrl("focal://onboarding")).toBe(true)
    expect(isOnboardingFeedUrl("focal://onboarding/feed")).toBe(true)

    expect(isOnboardingEntryUrl("folo://onboarding")).toBe(false)
    expect(isOnboardingFeedUrl("folo://onboarding/feed")).toBe(false)
    expect(isOnboardingEntryUrl("follow://onboarding")).toBe(false)
    expect(isOnboardingFeedUrl("https://example.com/onboarding")).toBe(false)
  })
})
