import type { ChangelogLanguage } from "../../../../../changelog/constants"
import { CHANGELOG_FALLBACK_CHAIN } from "../../../../../changelog/constants"

export type ChangelogContents = Partial<Record<ChangelogLanguage, string>>

const isChangelogLanguage = (language: string): language is ChangelogLanguage =>
  language in CHANGELOG_FALLBACK_CHAIN

export const hasChangelogContent = (contents: ChangelogContents) =>
  Object.values(contents).some((content) => (content ?? "").trim().length > 0)

export const resolveChangelogContent = (contents: ChangelogContents, language: string): string => {
  const fallbackChain = isChangelogLanguage(language)
    ? CHANGELOG_FALLBACK_CHAIN[language]
    : CHANGELOG_FALLBACK_CHAIN.en

  for (const candidate of fallbackChain) {
    const content = contents[candidate]
    if (content?.trim()) {
      return content
    }
  }

  return ""
}
