import { useEntryStore } from "@follow/store/entry/store"
import { useEntryEmbeddingStore } from "@follow/store/entry-embedding/store"
import type { StorylineBuildOptions } from "@follow/store/storyline/engine"
import {
  STORYLINE_MAX_HISTORY_CANDIDATES,
  STORYLINE_MAX_RECENT_CANDIDATES,
  STORYLINE_WINDOW_HOURS,
} from "@follow/store/storyline/engine"
import { storylineActions } from "@follow/store/storyline/store"

import type { StorylineWorkerRequest, StorylineWorkerResponse } from "./storyline.worker"

let worker: Worker | null = null
let workerRequestId = 0
let cancelActiveAnalysis: (() => void) | null = null

const getWorker = () => {
  if (worker) return worker
  worker = new Worker(new URL("storyline.worker.ts", import.meta.url), { type: "module" })
  return worker
}

const analyze = (request: StorylineWorkerRequest) =>
  new Promise<Extract<StorylineWorkerResponse, { result: unknown }>["result"]>(
    (resolve, reject) => {
      cancelActiveAnalysis?.()
      const activeWorker = getWorker()
      const cleanup = () => {
        activeWorker.removeEventListener("message", handleMessage)
        activeWorker.removeEventListener("error", handleError)
        cancelActiveAnalysis = null
      }
      const handleMessage = (event: MessageEvent<StorylineWorkerResponse>) => {
        if (event.data.requestId !== request.requestId) return
        cleanup()

        if ("error" in event.data) reject(new Error(event.data.error))
        else resolve(event.data.result)
      }
      const handleError = (event: ErrorEvent) => {
        cleanup()
        activeWorker.terminate()
        if (worker === activeWorker) worker = null
        reject(event.error ?? new Error(event.message))
      }
      cancelActiveAnalysis = () => {
        cleanup()
        activeWorker.terminate()
        if (worker === activeWorker) worker = null
        reject(new Error("Storyline analysis was superseded by newer content"))
      }

      activeWorker.addEventListener("message", handleMessage)
      activeWorker.addEventListener("error", handleError)
      activeWorker.postMessage(request)
    },
  )

export const refreshStorylines = async (options?: StorylineBuildOptions) => {
  const refreshVersion = storylineActions.beginRefresh()
  const entryData = useEntryStore.getState().data
  const embeddingData = useEntryEmbeddingStore.getState().data
  const now = options?.now ?? Date.now()
  const windowHours = options?.windowHours ?? STORYLINE_WINDOW_HOURS
  const windowStartedAt = now - windowHours * 60 * 60 * 1000
  const maxRecentCandidates = options?.maxRecentCandidates ?? STORYLINE_MAX_RECENT_CANDIDATES
  const maxHistoryCandidates = options?.maxHistoryCandidates ?? STORYLINE_MAX_HISTORY_CANDIDATES
  const feedEntries = Object.values(entryData).filter((entry) => !!entry.feedId)
  const recentEntries = feedEntries.filter(
    (entry) => entry.publishedAt.getTime() >= windowStartedAt && entry.publishedAt.getTime() <= now,
  )
  const embeddedRecentEntries = recentEntries
    .filter((entry) => embeddingData[entry.id]?.vector.length)
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime())
  const recentCandidates = embeddedRecentEntries.slice(0, maxRecentCandidates)
  const historyCandidates = feedEntries
    .filter(
      (entry) =>
        entry.publishedAt.getTime() < windowStartedAt && embeddingData[entry.id]?.vector.length,
    )
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime())
    .slice(0, maxHistoryCandidates)
  const entries = [...recentCandidates, ...historyCandidates].map((entry) => ({
    entryId: entry.id,
    title: entry.title ?? "",
    description: entry.description,
    publishedAt: entry.publishedAt.getTime(),
    feedId: entry.feedId,
    vector: embeddingData[entry.id]?.vector,
  }))

  try {
    const result = await analyze({
      requestId: ++workerRequestId,
      entries,
      options: {
        ...options,
        now,
        windowHours,
        maxRecentCandidates,
        maxHistoryCandidates,
        recentEntryCountTotal: recentEntries.length,
        embeddedRecentEntryCountTotal: embeddedRecentEntries.length,
      },
    })
    storylineActions.applyResult(refreshVersion, result, Object.keys(embeddingData).length)
    return result
  } catch (error) {
    storylineActions.failRefresh(refreshVersion, error)
    throw error
  }
}
