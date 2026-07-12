import { queryEmbeddingService } from "@follow/store/entry-embedding/query-embedding"
import { useEffect, useState } from "react"

import { resolveMinQueryLengthForSearch } from "~/store/search/library-search"

/**
 * Embed a free-text query with the local embedding provider.
 * Returns null while loading, when embedding is disabled, or on failure.
 * Cached by the store-level queryEmbeddingService.
 */
export const useQueryEmbeddingVector = (query: string): number[] | null => {
  const normalized = query.trim()
  const [vector, setVector] = useState<number[] | null>(
    () => queryEmbeddingService.getCached(normalized)?.vector ?? null,
  )

  useEffect(() => {
    if (!normalized || normalized.length < resolveMinQueryLengthForSearch(normalized)) {
      setVector(null)
      return
    }

    const cached = queryEmbeddingService.getCached(normalized)
    if (cached) {
      setVector(cached.vector)
      return
    }

    let cancelled = false
    setVector(null)

    void queryEmbeddingService.embed(normalized).then((result) => {
      if (cancelled) return
      setVector(result?.vector ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [normalized])

  return vector
}
