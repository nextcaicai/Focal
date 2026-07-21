/// <reference lib="webworker" />

import type {
  StorylineBuildEntry,
  StorylineBuildOptions,
  StorylineBuildResult,
} from "@follow/store/storyline/engine"
import { buildStorylines } from "@follow/store/storyline/engine"

export type StorylineWorkerRequest = {
  requestId: number
  entries: StorylineBuildEntry[]
  options?: StorylineBuildOptions
}

export type StorylineWorkerResponse =
  | { requestId: number; result: StorylineBuildResult }
  | { requestId: number; error: string }

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.addEventListener("message", (event: MessageEvent<StorylineWorkerRequest>) => {
  const { requestId, entries, options } = event.data
  try {
    workerScope.postMessage({
      requestId,
      result: buildStorylines(entries, options),
    } satisfies StorylineWorkerResponse)
  } catch (error) {
    workerScope.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error),
    } satisfies StorylineWorkerResponse)
  }
})

export {}
