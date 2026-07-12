import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  dedupeQueuePreserveOrder,
  entryEmbeddingJobService,
  splitEmbeddingApiBatches,
} from "./job-service"
import { entryEmbeddingActions } from "./store"

beforeEach(() => {
  vi.restoreAllMocks()
  entryEmbeddingJobService.resetForTest()
})

describe("dedupeQueuePreserveOrder", () => {
  it("keeps first occurrence and drops later duplicates", () => {
    expect(dedupeQueuePreserveOrder(["a", "b", "a", "c", "b", "a"])).toEqual(["a", "b", "c"])
  })

  it("returns the same sequence when already unique", () => {
    expect(dedupeQueuePreserveOrder(["x", "y", "z"])).toEqual(["x", "y", "z"])
  })

  it("handles empty input", () => {
    expect(dedupeQueuePreserveOrder([])).toEqual([])
  })
})

describe("splitEmbeddingApiBatches", () => {
  it("splits entry ids into fixed-size API batches", () => {
    const ids = Array.from({ length: 70 }, (_, index) => `e-${index}`)
    expect(splitEmbeddingApiBatches(ids, 32)).toEqual([
      ids.slice(0, 32),
      ids.slice(32, 64),
      ids.slice(64, 70),
    ])
  })

  it("returns empty array for empty input", () => {
    expect(splitEmbeddingApiBatches([], 32)).toEqual([])
  })
})

describe("entryEmbeddingJobService", () => {
  it("does not enqueue a library backfill before embeddings hydrate", () => {
    vi.spyOn(entryEmbeddingActions, "isHydrated").mockReturnValue(false)

    expect(entryEmbeddingJobService.enqueueAllMissing()).toBe(0)
  })
})
