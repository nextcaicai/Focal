/**
 * Library search ranking for Step 1 (product rule: match → time → quality).
 * Pure helpers — no I/O.
 */

export type RankableEntry = {
  id: string
  title?: string | null
  description?: string | null
  content?: string | null
  publishedAt: Date | number
}

/** Higher = stronger keyword match. 0 = no match. */
export function scoreKeywordMatch(entry: RankableEntry, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  // toLowerCase is a no-op for CJK; still required for Latin case-insensitivity.
  const title = (entry.title ?? "").toLowerCase()
  const description = (entry.description ?? "").toLowerCase()
  // Strip coarse HTML for content matching
  const content = (entry.content ?? "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .toLowerCase()

  if (!title && !description && !content) return 0

  if (title === q) return 100
  if (title.startsWith(q)) return 90
  if (title.includes(q)) return 80
  if (description.includes(q)) return 50
  if (content.includes(q)) return 20
  return 0
}

export type TranslationTextFields = {
  title?: string | null
  description?: string | null
  content?: string | null
}

/**
 * Best keyword score across original entry fields and any stored translations.
 * List UI often shows translated titles; search must match what the user sees.
 */
export function scoreEntryWithTranslations(
  entry: RankableEntry,
  query: string,
  translations?: Partial<Record<string, TranslationTextFields>> | null,
): number {
  let best = scoreKeywordMatch(entry, query)
  if (!translations) return best

  for (const translation of Object.values(translations)) {
    if (!translation) continue
    const score = scoreKeywordMatch(
      {
        id: entry.id,
        title: translation.title,
        description: translation.description,
        content: translation.content,
        publishedAt: entry.publishedAt,
      },
      query,
    )
    if (score > best) best = score
  }

  return best
}

const publishedAtMs = (value: Date | number) =>
  value instanceof Date ? value.getTime() : Number(value) || 0

/**
 * Sort matched entries: relevance (match tier → time → quality) or latest (time only).
 * Entries with match score 0 should be filtered out before calling.
 */
export function sortSearchHits(
  hits: Array<{
    entryId: string
    matchScore: number
    publishedAt: Date | number
    qualityScore: number | null
  }>,
  sort: "relevance" | "latest",
): string[] {
  const copy = hits.slice()

  if (sort === "latest") {
    copy.sort((a, b) => publishedAtMs(b.publishedAt) - publishedAtMs(a.publishedAt))
    return copy.map((h) => h.entryId)
  }

  copy.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore
    const timeDiff = publishedAtMs(b.publishedAt) - publishedAtMs(a.publishedAt)
    if (timeDiff !== 0) return timeDiff
    const qa = a.qualityScore
    const qb = b.qualityScore
    if (qa == null && qb == null) return 0
    if (qa == null) return 0
    if (qb == null) return 0
    return qb - qa
  })

  return copy.map((h) => h.entryId)
}
