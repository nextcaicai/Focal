import { getEntry } from "../modules/entry/getter"

const ONBOARDING_ENTRY_URL_PREFIXES = ["focal://onboarding"] as const

export const isOnboardingEntryUrl = (url?: string | null) => {
  return (
    typeof url === "string" &&
    ONBOARDING_ENTRY_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
  )
}

export const isOnboardingEntry = (entryId: string) => {
  return isOnboardingEntryUrl(getEntry(entryId)?.url)
}

export const isOnboardingFeedUrl = (url?: string | null) => {
  return isOnboardingEntryUrl(url)
}
