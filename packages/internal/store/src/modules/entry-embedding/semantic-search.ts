/**
 * Pure semantic ranking over entry embedding vectors.
 * No I/O — callers supply a query vector and the in-memory embedding map.
 *
 * Hybrid policy (library search):
 * - Keyword / substring hits always count (trusted for entity names like 华为).
 * - Pure-semantic inclusion needs a high cosine floor so "same neighborhood"
 *   business/tech articles do not flood short-query results.
 */

import { cosineSimilarity } from "@follow/shared/interest-profile"

/**
 * Default minimum cosine for pure-semantic inclusion (paraphrase / cross-lingual).
 * Kept deliberately above the "vaguely related" band (~0.3–0.4).
 */
export const SEMANTIC_SEARCH_MIN_SCORE = 0.48

/**
 * Keyword topics: slightly looser than search standalone so follow-topic
 * recall is not empty, but still tighter than the old 0.34 floor.
 */
export const SEMANTIC_TOPIC_MIN_SCORE = 0.45

/** Minimal shape needed for ranking — full EntryEmbeddingRecord also satisfies this. */
export type SemanticSearchableEmbedding = {
  vector: number[]
}

export type SemanticHit = {
  entryId: string
  cosine: number
}

export type CollectSemanticHitsOptions = {
  minScore?: number
  /** Hard cap after sorting by cosine desc. */
  limit?: number
}

/**
 * Adaptive pure-semantic floor for a free-text query.
 * Short CJK / short tokens behave like entity lookups and need a stricter bar
 * (e.g. 「华为」 must not pull every China-startup digest).
 */
export const resolveSemanticStandaloneMinScore = (query?: string): number => {
  const q = query?.trim() ?? ""
  if (!q) return SEMANTIC_SEARCH_MIN_SCORE

  const cjkCount = q.match(/[\u4e00-\u9fff]/g)?.length ?? 0
  // 1–4 CJK chars, little other content → brand / person / product style
  if (cjkCount >= 1 && cjkCount <= 4 && q.length <= 8) {
    return 0.58
  }
  // Short Latin tokens (e.g. "RAG", "MCP", "OpenAI")
  if (cjkCount === 0 && q.length <= 8) {
    return 0.55
  }
  // Longer natural-language queries can be a bit looser
  if (q.length >= 16) {
    return 0.45
  }
  return SEMANTIC_SEARCH_MIN_SCORE
}

/**
 * Map cosine ∈ [minScore, 1] onto the same 0–100 scale used by keyword match tiers
 * so hybrid search can take max(keyword, semanticPoints).
 */
export const semanticCosineToMatchPoints = (
  cosine: number,
  minScore: number = SEMANTIC_SEARCH_MIN_SCORE,
): number => {
  if (!Number.isFinite(cosine) || cosine < minScore) return 0
  const span = Math.max(1e-6, 1 - minScore)
  const t = Math.min(1, Math.max(0, (cosine - minScore) / span))
  // Floor 40 ≈ between content (20) and description (50); ceiling 92 below title exact (100).
  return Math.round(40 + t * 52)
}

export type CombineSearchMatchScoreOptions = {
  /** Pure-semantic inclusion floor. Prefer resolveSemanticStandaloneMinScore(query). */
  minScore?: number
}

/**
 * Hybrid relevance:
 * - keywordScore > 0 → include; semantic may raise rank if stronger
 * - keywordScore === 0 → include only when cosine ≥ minScore (standalone semantic)
 */
export const combineSearchMatchScore = (
  keywordScore: number,
  semanticCosine: number | null | undefined,
  minScoreOrOptions: number | CombineSearchMatchScoreOptions = SEMANTIC_SEARCH_MIN_SCORE,
): number => {
  const minScore =
    typeof minScoreOrOptions === "number"
      ? minScoreOrOptions
      : (minScoreOrOptions.minScore ?? SEMANTIC_SEARCH_MIN_SCORE)

  if (keywordScore > 0) {
    // Already a literal hit — keep it. Semantic may outrank only when very strong.
    if (semanticCosine == null || semanticCosine < minScore) return keywordScore
    return Math.max(keywordScore, semanticCosineToMatchPoints(semanticCosine, minScore))
  }

  if (semanticCosine == null || semanticCosine < minScore) return 0
  return semanticCosineToMatchPoints(semanticCosine, minScore)
}

export const collectSemanticHits = (
  queryVector: number[] | null | undefined,
  embeddings: Record<string, SemanticSearchableEmbedding | undefined>,
  options: CollectSemanticHitsOptions = {},
): SemanticHit[] => {
  if (!queryVector?.length) return []

  const minScore = options.minScore ?? SEMANTIC_SEARCH_MIN_SCORE
  const hits: SemanticHit[] = []

  for (const [entryId, record] of Object.entries(embeddings)) {
    const vector = record?.vector
    if (!vector?.length || vector.length !== queryVector.length) continue

    const cosine = cosineSimilarity(queryVector, vector)
    if (cosine < minScore) continue
    hits.push({ entryId, cosine })
  }

  hits.sort((a, b) => b.cosine - a.cosine)

  if (options.limit != null && options.limit >= 0) {
    return hits.slice(0, options.limit)
  }

  return hits
}

export const buildSemanticScoreByEntryId = (
  queryVector: number[] | null | undefined,
  embeddings: Record<string, SemanticSearchableEmbedding | undefined>,
  options: CollectSemanticHitsOptions = {},
): Map<string, number> => {
  const map = new Map<string, number>()
  for (const hit of collectSemanticHits(queryVector, embeddings, options)) {
    map.set(hit.entryId, hit.cosine)
  }
  return map
}

export const entryMatchesSemanticQuery = (
  entryId: string,
  semanticScores: Map<string, number> | null | undefined,
  minScore: number = SEMANTIC_TOPIC_MIN_SCORE,
): boolean => {
  const score = semanticScores?.get(entryId)
  return score != null && score >= minScore
}
