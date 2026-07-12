import { entryActions, useEntryStore } from "@follow/store/entry/store"
import {
  buildSemanticScoreByEntryId,
  combineSearchMatchScore,
  isEntityLookupQuery,
  resolveSemanticStandaloneMinScore,
} from "@follow/store/entry-embedding/semantic-search"
import { useEntryEmbeddingStore } from "@follow/store/entry-embedding/store"
import { entryQualityScoreActions } from "@follow/store/entry-quality-score/store"
import { useTranslationStore } from "@follow/store/translation/store"
import { useEffect, useMemo } from "react"

import {
  useLibrarySearchSession,
  useLibrarySearchTotalHits,
  useSetLibrarySearchEntryIds,
  useSetLibrarySearchTotalHits,
} from "~/atoms/library-search"
import { useQueryEmbeddingVector } from "~/hooks/biz/useQueryEmbeddingVector"
import { appLog } from "~/lib/log"

import { scoreEntryWithTranslations, sortSearchHits } from "./rank"

const SEARCH_PERF_LOG_MS = 16
/** Cap semantic cosine work when keyword hits exist (P1 prefilter). */
export const SEMANTIC_KEYWORD_PREFILTER_MAX = 500
/** Max rows rendered in the entry list during library search. */
export const LIBRARY_SEARCH_DISPLAY_MAX = 50
/** Max hits kept after ranking (keyword + capped pure-semantic). */
export const LIBRARY_SEARCH_TOTAL_MAX = 80
/** Max pure-semantic rows (keywordScore === 0) appended after keyword hits. */
export const LIBRARY_SEARCH_PURE_SEMANTIC_MAX = 20
/** RSS description substring tier (see rank.ts). */
export const KEYWORD_MATCH_DESCRIPTION_SCORE = 50
/** Max description-only hits for entity lookup queries (codex, 华为). */
export const ENTITY_LOOKUP_DESCRIPTION_MAX = 20

export type SearchEntryIdsOptions = {
  query: string
  /** Optional query embedding for hybrid (keyword + semantic) ranking. */
  queryVector?: number[] | null
  /** entryId → embedding record from the embedding store. */
  embeddings?: Record<string, { vector: number[] } | undefined>
}

/** Minimum trimmed query length before running library search. */
export const resolveMinQueryLengthForSearch = (query: string): number => {
  const trimmed = query.trim()
  if (!trimmed) return 1
  return /[\u4e00-\u9fff]/.test(trimmed) ? 1 : 2
}

/**
 * Semantic re-rank runs only when keyword hits exist.
 * Zero-hit queries stay keyword-only (avoids full-library noise on typos/gibberish).
 */
export const shouldRunLibrarySemanticSearch = (
  query: string,
  keywordHitCount: number,
  hasQueryVector: boolean,
): boolean => {
  if (!hasQueryVector) return false
  if (isEntityLookupQuery(query)) return false
  return keywordHitCount > 0
}

type SearchHitRow = {
  entryId: string
  matchScore: number
  publishedAt: Date
  qualityScore: number | null
}

/** Entity lookups: keep all title hits; cap RSS-description-only rows. */
export const applyEntityLookupDescriptionCap = (
  query: string,
  hits: SearchHitRow[],
  keywordScoresByEntryId: Map<string, number>,
): SearchHitRow[] => {
  if (!isEntityLookupQuery(query)) return hits

  const strong: SearchHitRow[] = []
  const descriptionOnly: SearchHitRow[] = []

  for (const hit of hits) {
    const keywordScore = keywordScoresByEntryId.get(hit.entryId) ?? 0
    if (keywordScore === KEYWORD_MATCH_DESCRIPTION_SCORE) {
      descriptionOnly.push(hit)
    } else {
      strong.push(hit)
    }
  }

  if (descriptionOnly.length <= ENTITY_LOOKUP_DESCRIPTION_MAX) {
    return hits
  }

  const rankedIds = sortSearchHits(descriptionOnly, "relevance").slice(
    0,
    ENTITY_LOOKUP_DESCRIPTION_MAX,
  )
  const descriptionById = new Map(descriptionOnly.map((hit) => [hit.entryId, hit]))
  const rankedDescription = rankedIds.map((entryId) => descriptionById.get(entryId)!)

  return [...strong, ...rankedDescription]
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
 * 5. Zero keyword hits → keyword-only (no full-library semantic).
 * 6. Entity lookups cap description-only hits.
 *
 * Always full-library keyword pass over the in-memory entry store.
 */
export function searchEntryIdsFromStore(options: SearchEntryIdsOptions): string[] {
  const query = options.query.trim()
  if (!query || query.length < resolveMinQueryLengthForSearch(query)) return []

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

  const runSemantic = shouldRunLibrarySemanticSearch(
    query,
    keywordScoresByEntryId.size,
    hasQueryVector,
  )

  const semanticStart = performance.now()
  const semanticEntryIds = runSemantic
    ? resolveSemanticSearchEntryIds(keywordScoresByEntryId)
    : undefined
  const semanticByEntry = runSemantic
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
    const pureSemanticCandidates = [...semanticByEntry.entries()]
      .filter(([entryId]) => !seen.has(entryId))
      .sort((left, right) => right[1] - left[1])
      .slice(0, LIBRARY_SEARCH_PURE_SEMANTIC_MAX)

    for (const [entryId, cosine] of pureSemanticCandidates) {
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
  const cappedHits = applyEntityLookupDescriptionCap(query, hits, keywordScoresByEntryId)
  const sorted = sortSearchHits(cappedHits, "relevance").slice(0, LIBRARY_SEARCH_TOTAL_MAX)
  const sortMs = performance.now() - sortStart
  const totalMs = performance.now() - totalStart

  if (totalMs >= SEARCH_PERF_LOG_MS) {
    appLog(
      `[perf] search total ${totalMs.toFixed(0)}ms semantic=${semanticMs.toFixed(0)}ms keyword=${keywordMs.toFixed(0)}ms sort=${sortMs.toFixed(0)}ms hits=${sorted.length} entries=${Object.keys(entries).length} embeddings=${Object.keys(options.embeddings ?? {}).length} semanticScope=${semanticEntryIds?.size ?? (runSemantic ? "all" : "off")} vector=${hasQueryVector} query="${query}"`,
    )
  }

  return sorted
}

/**
 * Hook: ranked entry ids for the active library search session.
 * Progressive: keyword results first; semantic re-rank when query vector is ready.
 * Embedding store updates during the same query do not trigger a recompute (P1 snapshot).
 *
 * Call from a single consumer (useEntriesByView). Header reads count via useLibrarySearchResultCount.
 */
export function useLibrarySearchEntryIds(): string[] {
  const session = useLibrarySearchSession()
  const query = session.query.trim()
  const queryVector = useQueryEmbeddingVector(query)
  const entryRevision = useEntryStore((s) => Object.keys(s.data).length)
  const translationRevision = useTranslationStore((s) => Object.keys(s.data).length)
  const setEntryIds = useSetLibrarySearchEntryIds()
  const setTotalHits = useSetLibrarySearchTotalHits()

  const rankedEntryIds = useMemo(() => {
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

  const displayEntryIds = useMemo(
    () => rankedEntryIds.slice(0, LIBRARY_SEARCH_DISPLAY_MAX),
    [rankedEntryIds],
  )

  useEffect(() => {
    setEntryIds(displayEntryIds)
    setTotalHits(rankedEntryIds.length)
  }, [displayEntryIds, rankedEntryIds.length, setEntryIds, setTotalHits])

  return displayEntryIds
}

/** Header title hit count — avoids running a second full search. */
export function useLibrarySearchResultCount(): number {
  return useLibrarySearchTotalHits()
}
