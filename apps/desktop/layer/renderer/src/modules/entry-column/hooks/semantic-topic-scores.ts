import type { SemanticSearchableEmbedding } from "@follow/store/entry-embedding/semantic-search"
import {
  buildSemanticScoreByEntryId,
  SEMANTIC_TOPIC_MIN_SCORE,
} from "@follow/store/entry-embedding/semantic-search"

type KeywordTopicSemanticScoresOptions = {
  query: string
  queryVector: number[] | null | undefined
  embeddings: Record<string, SemanticSearchableEmbedding | undefined>
  refreshKey: number
}

const SEMANTIC_TOPIC_SCORE_CACHE_LIMIT = 8
const semanticTopicScoreCache = new Map<string, Map<string, number>>()

const normalizeQuery = (query: string) => query.trim().toLowerCase()

const getVectorSignature = (vector: number[]) => {
  const first = vector[0] ?? 0
  const last = vector.at(-1) ?? 0
  return `${vector.length}:${first.toFixed(6)}:${last.toFixed(6)}`
}

export const getKeywordTopicSemanticScoresCacheKey = ({
  query,
  queryVector,
  refreshKey,
}: Omit<KeywordTopicSemanticScoresOptions, "embeddings">) => {
  if (!queryVector?.length) return null
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return null
  return `${normalizedQuery}\0${refreshKey}\0${getVectorSignature(queryVector)}`
}

export const getKeywordTopicSemanticScoresSnapshot = ({
  query,
  queryVector,
  embeddings,
  refreshKey,
}: KeywordTopicSemanticScoresOptions) => {
  const cacheKey = getKeywordTopicSemanticScoresCacheKey({ query, queryVector, refreshKey })
  if (!cacheKey) return null

  const cached = semanticTopicScoreCache.get(cacheKey)
  if (cached) return cached

  const scores = buildSemanticScoreByEntryId(queryVector, embeddings, {
    minScore: SEMANTIC_TOPIC_MIN_SCORE,
  })

  semanticTopicScoreCache.set(cacheKey, scores)
  if (semanticTopicScoreCache.size > SEMANTIC_TOPIC_SCORE_CACHE_LIMIT) {
    const oldestKey = semanticTopicScoreCache.keys().next().value
    if (oldestKey) {
      semanticTopicScoreCache.delete(oldestKey)
    }
  }

  return scores
}

export const clearKeywordTopicSemanticScoreCacheForTest = () => {
  semanticTopicScoreCache.clear()
}
