/**
 * Embed free-text queries (library search, keyword topics) via the same
 * embeddingGenerator used for entries. Results are cached in-memory by
 * normalized query text.
 */

import { embeddingGenerator } from "../../context"

export type QueryEmbeddingResult = {
  vector: number[]
  dimension: number
  model: string
  provider: string
}

const normalizeQueryKey = (text: string) => text.trim().replaceAll(/\s+/g, " ").toLowerCase()

class QueryEmbeddingService {
  private cache = new Map<string, QueryEmbeddingResult>()
  private inflight = new Map<string, Promise<QueryEmbeddingResult | null>>()

  getCached(text: string): QueryEmbeddingResult | null {
    const key = normalizeQueryKey(text)
    if (!key) return null
    return this.cache.get(key) ?? null
  }

  async embed(text: string): Promise<QueryEmbeddingResult | null> {
    const key = normalizeQueryKey(text)
    if (!key) return null

    const cached = this.cache.get(key)
    if (cached) return cached

    const pending = this.inflight.get(key)
    if (pending) return pending

    const task = this.runEmbed(key, text.trim())
    this.inflight.set(key, task)
    try {
      return await task
    } finally {
      this.inflight.delete(key)
    }
  }

  private async runEmbed(key: string, text: string): Promise<QueryEmbeddingResult | null> {
    const generator = embeddingGenerator()
    if (!generator) return null

    try {
      const generated = await generator({
        // Synthetic id — generators only need `text` for the API call.
        entryId: `__query__:${key.slice(0, 64)}`,
        text,
      })
      if (!generated?.vector || generated.vector.length === 0) return null

      const result: QueryEmbeddingResult = {
        vector: generated.vector,
        dimension: generated.dimension ?? generated.vector.length,
        model: generated.model,
        provider: generated.provider,
      }
      this.cache.set(key, result)
      return result
    } catch (error) {
      console.warn("[embedding] Query embed failed:", error)
      return null
    }
  }

  /** Test helper. */
  resetForTest() {
    this.cache.clear()
    this.inflight.clear()
  }
}

export const queryEmbeddingService = new QueryEmbeddingService()
