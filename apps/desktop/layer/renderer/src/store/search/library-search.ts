import { entryActions, useEntryStore } from "@follow/store/entry/store"
import {
  buildSemanticScoreByEntryId,
  combineSearchMatchScore,
  resolveSemanticStandaloneMinScore,
} from "@follow/store/entry-embedding/semantic-search"
import { useEntryEmbeddingStore } from "@follow/store/entry-embedding/store"
import { entryQualityScoreActions } from "@follow/store/entry-quality-score/store"
import { useTranslationStore } from "@follow/store/translation/store"
import { useMemo } from "react"

import { useLibrarySearchSession } from "~/atoms/library-search"
import { useQueryEmbeddingVector } from "~/hooks/biz/useQueryEmbeddingVector"

import { scoreEntryWithTranslations, sortSearchHits } from "./rank"

export type SearchEntryIdsOptions = {
  query: string
  /** Optional query embedding for hybrid (keyword + semantic) ranking. */
  queryVector?: number[] | null
  /** entryId → embedding record from the embedding store. */
  embeddings?: Record<string, { vector: number[] } | undefined>
}

/**
 * Scan in-memory entry store for keyword (+ optional semantic) matches.
 * Always full-library. Includes AI title/description translations so
 * Chinese queries match translated UI titles. Semantic hits cover
 * synonym / cross-language cases when entry vectors exist.
 */
export function searchEntryIdsFromStore(options: SearchEntryIdsOptions): string[] {
  const query = options.query.trim()
  if (!query) return []

  const entries = entryActions.getFlattenMapEntries()
  const translationsByEntryId = useTranslationStore.getState().data
  // Short entity-like queries (e.g. 华为) use a higher pure-semantic floor so
  // "same vector neighborhood" noise does not flood the result list.
  const semanticMinScore = resolveSemanticStandaloneMinScore(query)
  const semanticByEntry = buildSemanticScoreByEntryId(
    options.queryVector,
    options.embeddings ?? {},
    { minScore: semanticMinScore },
  )

  const hits: Array<{
    entryId: string
    matchScore: number
    publishedAt: Date
    qualityScore: number | null
  }> = []

  // Keyword path over all entries + pure-semantic hits above the adaptive floor
  // (synonym / cross-language when vectors exist).
  const candidateIds = new Set<string>(Object.keys(entries))
  for (const entryId of semanticByEntry.keys()) {
    candidateIds.add(entryId)
  }

  for (const entryId of candidateIds) {
    const entry = entries[entryId]
    if (!entry) continue

    const keywordScore = scoreEntryWithTranslations(
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
    const semanticCosine = semanticByEntry.get(entryId) ?? null
    const matchScore = combineSearchMatchScore(keywordScore, semanticCosine, {
      minScore: semanticMinScore,
    })
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
 * Progressive: keyword results first; semantic re-rank when query vector is ready.
 */
export function useLibrarySearchEntryIds(): string[] {
  const session = useLibrarySearchSession()
  const query = session.query.trim()
  const queryVector = useQueryEmbeddingVector(query)
  const entryRevision = useEntryStore((s) => Object.keys(s.data).length)
  // Translations often hold the Chinese title the user sees; re-run when they hydrate/update.
  const translationRevision = useTranslationStore((s) => Object.keys(s.data).length)
  const embeddingRevision = useEntryEmbeddingStore((s) => Object.keys(s.data).length)
  const embeddings = useEntryEmbeddingStore((s) => s.data)

  return useMemo(() => {
    void entryRevision
    void translationRevision
    void embeddingRevision
    if (!query) return []

    return searchEntryIdsFromStore({
      query,
      queryVector,
      embeddings,
    })
  }, [entryRevision, translationRevision, embeddingRevision, query, queryVector, embeddings])
}
