export type EmbeddingApiResponseItem = {
  index?: number
  embedding?: number[]
}

/** Map OpenAI-compatible embedding list response to vectors by `index`. */
export const parseEmbeddingApiVectors = (
  data: EmbeddingApiResponseItem[] | undefined,
  expectedCount: number,
): Array<number[] | null> => {
  if (expectedCount <= 0) return []

  const vectors: Array<number[] | undefined> = Array.from({ length: expectedCount })
  for (const item of data ?? []) {
    const index = item.index ?? 0
    if (index < 0 || index >= expectedCount) continue
    if (!item.embedding?.length) continue
    vectors[index] = item.embedding
  }

  return vectors.map((vector) => vector ?? null)
}
