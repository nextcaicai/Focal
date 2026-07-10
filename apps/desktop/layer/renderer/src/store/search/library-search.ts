import { entryActions, useEntryStore } from "@follow/store/entry/store"
import { entryQualityScoreActions } from "@follow/store/entry-quality-score/store"
import { useTranslationStore } from "@follow/store/translation/store"
import { useMemo } from "react"

import { useLibrarySearchSession } from "~/atoms/library-search"

import { scoreEntryWithTranslations, sortSearchHits } from "./rank"

export type SearchEntryIdsOptions = {
  query: string
}

/**
 * Scan in-memory entry store for keyword matches and return ranked ids.
 * Always full-library. Includes AI title/description translations so
 * Chinese queries match translated UI titles.
 */
export function searchEntryIdsFromStore(options: SearchEntryIdsOptions): string[] {
  const query = options.query.trim()
  if (!query) return []

  const entries = entryActions.getFlattenMapEntries()
  const translationsByEntryId = useTranslationStore.getState().data
  const hits: Array<{
    entryId: string
    matchScore: number
    publishedAt: Date
    qualityScore: number | null
  }> = []

  for (const entry of Object.values(entries)) {
    if (!entry) continue

    const matchScore = scoreEntryWithTranslations(
      {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        content: entry.content,
        publishedAt: entry.publishedAt,
      },
      query,
      translationsByEntryId[entry.id],
    )
    if (matchScore <= 0) continue

    const quality = entryQualityScoreActions.getScore(entry.id)
    hits.push({
      entryId: entry.id,
      matchScore,
      publishedAt: entry.publishedAt,
      qualityScore: quality?.quality_score ?? null,
    })
  }

  // Always relevance: match → time → quality
  return sortSearchHits(hits, "relevance")
}

/**
 * Hook: ranked entry ids for the active library search session.
 */
export function useLibrarySearchEntryIds(): string[] {
  const session = useLibrarySearchSession()
  const query = session.query.trim()
  const entryRevision = useEntryStore((s) => Object.keys(s.data).length)
  // Translations often hold the Chinese title the user sees; re-run when they hydrate/update.
  const translationRevision = useTranslationStore((s) => Object.keys(s.data).length)

  return useMemo(() => {
    void entryRevision
    void translationRevision
    if (!query) return []

    return searchEntryIdsFromStore({ query })
  }, [entryRevision, translationRevision, query])
}
