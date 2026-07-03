import { describe, expect, it } from "vitest"

import { isOnboardingEntryUrl, isOnboardingFeedUrl } from "./onboarding"

describe("onboarding URL sentinels", () => {
  it("recognizes focal onboarding URLs while preserving local legacy onboarding data", () => {
    expect(isOnboardingEntryUrl("focal://onboarding")).toBe(true)
    expect(isOnboardingFeedUrl("focal://onboarding/feed")).toBe(true)

    expect(isOnboardingEntryUrl("folo://onboarding")).toBe(true)
    expect(isOnboardingFeedUrl("folo://onboarding/feed")).toBe(true)

    expect(isOnboardingEntryUrl("follow://onboarding")).toBe(false)
    expect(isOnboardingFeedUrl("https://example.com/onboarding")).toBe(false)
  })
})
