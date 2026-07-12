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
import { appLog } from "~/lib/log"

import { scoreEntryWithTranslations, sortSearchHits } from "./rank"

const SEARCH_PERF_LOG_MS = 16
/** Cap semantic cosine work when keyword hits exist (P1 prefilter). */
export const SEMANTIC_KEYWORD_PREFILTER_MAX = 500

export type SearchEntryIdsOptions = {
  query: string
  /** Optional query embedding for hybrid (keyword + semantic) ranking. */
  queryVector?: number[] | null
  /** entryId → embedding record from the embedding store. */
  embeddings?: Record<string, { vector: number[] } | undefined>
}

export const resolveSemanticSearchEntryIds = (
  keywordScoresByEntryId: Map<string, number>,
): ReadonlySet<string> | undefined => {
  const candidates = [...keywordScoresByEntryId.entries()]
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1])

  if (candidates.length === 0) return undefined

  return new Set(candidates.slice(0, SEMANTIC_KEYWORD_PREFILTER_MAX).map(([entryId]) => entryId))
}

/**
 * Library hybrid search — performance policy (v0.2.6+):
 * 1. Keyword path uses title + description (+ translations) only — not full HTML body.
 * 2. Semantic path pre-normalizes the query once; per-entry score is a fast dot/norm.
 * 3. Progressive: keyword-only while query vector loads, then re-rank with semantic.
 * 4. When keyword hits exist, semantic cosine runs on the candidate set only (P1).
 *
 * Always full-library keyword pass over the in-memory entry store.
 */
export function searchEntryIdsFromStore(options: SearchEntryIdsOptions): string[] {
  const query = options.query.trim()
  if (!query) return []

  const totalStart = performance.now()
  const entries = entryActions.getFlattenMapEntries()
  const translationsByEntryId = useTranslationStore.getState().data
  const semanticMinScore = resolveSemanticStandaloneMinScore(query)
  const hasQueryVector = Boolean(options.queryVector?.length)

  const keywordScoresByEntryId = new Map<string, number>()
  const keywordStart = performance.now()
  for (const entryId of Object.keys(entries)) {
    const entry = entries[entryId]
    if (!entry) continue

    const keywordScore = scoreEntryWithTranslations(
      {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        content: null,
        publishedAt: entry.publishedAt,
      },
      query,
      translationsByEntryId[entry.id],
      { fields: "title_description" },
    )
    if (keywordScore > 0) {
      keywordScoresByEntryId.set(entryId, keywordScore)
    }
  }
  const keywordMs = performance.now() - keywordStart

  const semanticStart = performance.now()
  const semanticEntryIds = hasQueryVector
    ? resolveSemanticSearchEntryIds(keywordScoresByEntryId)
    : undefined
  const semanticByEntry = hasQueryVector
    ? buildSemanticScoreByEntryId(options.queryVector, options.embeddings ?? {}, {
        minScore: semanticMinScore,
        entryIds: semanticEntryIds,
      })
    : null
  const semanticMs = performance.now() - semanticStart

  const hits: Array<{
    entryId: string
    matchScore: number
    publishedAt: Date
    qualityScore: number | null
  }> = []

  for (const entryId of Object.keys(entries)) {
    const entry = entries[entryId]
    if (!entry) continue

    const keywordScore = keywordScoresByEntryId.get(entryId) ?? 0
    const semanticCosine = semanticByEntry?.get(entryId) ?? null
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

  if (semanticByEntry) {
    const seen = new Set(hits.map((hit) => hit.entryId))
    for (const [entryId, cosine] of semanticByEntry) {
      if (seen.has(entryId)) continue
      const entry = entries[entryId]
      if (!entry) continue
      const matchScore = combineSearchMatchScore(0, cosine, { minScore: semanticMinScore })
      if (matchScore <= 0) continue
      const quality = entryQualityScoreActions.getScore(entryId)
      hits.push({
        entryId,
        matchScore,
        publishedAt: entry.publishedAt,
        qualityScore: quality?.quality_score ?? null,
      })
    }
  }

  const sortStart = performance.now()
  const sorted = sortSearchHits(hits, "relevance")
  const sortMs = performance.now() - sortStart
  const totalMs = performance.now() - totalStart

  if (totalMs >= SEARCH_PERF_LOG_MS) {
    appLog(
      `[perf] search total ${totalMs.toFixed(0)}ms semantic=${semanticMs.toFixed(0)}ms keyword=${keywordMs.toFixed(0)}ms sort=${sortMs.toFixed(0)}ms hits=${sorted.length} entries=${Object.keys(entries).length} embeddings=${Object.keys(options.embeddings ?? {}).length} semanticScope=${semanticEntryIds?.size ?? "all"} vector=${hasQueryVector} query="${query}"`,
    )
  }

  return sorted
}

/**
 * Hook: ranked entry ids for the active library search session.
 * Progressive: keyword results first; semantic re-rank when query vector is ready.
 * Embedding store updates during the same query do not trigger a recompute (P1 snapshot).
 */
export function useLibrarySearchEntryIds(): string[] {
  const session = useLibrarySearchSession()
  const query = session.query.trim()
  const queryVector = useQueryEmbeddingVector(query)
  const entryRevision = useEntryStore((s) => Object.keys(s.data).length)
  const translationRevision = useTranslationStore((s) => Object.keys(s.data).length)

  return useMemo(() => {
    void entryRevision
    void translationRevision
    if (!query) return []

    const embeddings = useEntryEmbeddingStore.getState().data

    return searchEntryIdsFromStore({
      query,
      queryVector,
      embeddings,
    })
  }, [entryRevision, translationRevision, query, queryVector])
}
