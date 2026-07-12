import { describe, expect, it } from "vitest"

import { parseEmbeddingApiVectors } from "./embedding-api-response"

describe("parseEmbeddingApiVectors", () => {
  it("maps vectors by index when response order is shuffled", () => {
    const vectors = parseEmbeddingApiVectors(
      [
        { index: 1, embedding: [2, 2] },
        { index: 0, embedding: [1, 1] },
      ],
      2,
    )

    expect(vectors).toEqual([
      [1, 1],
      [2, 2],
    ])
  })

  it("returns null slots for missing indices", () => {
    const vectors = parseEmbeddingApiVectors([{ index: 0, embedding: [1] }], 3)
    expect(vectors).toEqual([[1], null, null])
  })

  it("returns all nulls for empty response", () => {
    expect(parseEmbeddingApiVectors(undefined, 2)).toEqual([null, null])
  })
})
