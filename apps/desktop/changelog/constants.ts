export const CHANGELOG_LANGUAGES = ["en", "zh-CN", "zh-TW", "ja", "fr-FR"] as const

export type ChangelogLanguage = (typeof CHANGELOG_LANGUAGES)[number]

export const CHANGELOG_FALLBACK_CHAIN: Record<ChangelogLanguage, readonly ChangelogLanguage[]> = {
  en: ["en"],
  "zh-CN": ["zh-CN", "en"],
  "zh-TW": ["zh-TW", "zh-CN", "en"],
  ja: ["ja", "en"],
  "fr-FR": ["fr-FR", "en"],
}
