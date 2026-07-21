import { createZustandStore } from "../../lib/helper"
import type { Storyline, StorylineBuildResult } from "./engine"

export type StorylineProcessingStatus = "idle" | "processing" | "ready" | "error"

type StorylineState = StorylineBuildResult & {
  status: StorylineProcessingStatus
  selectedStorylineId: string | null
  embeddingRecordCount: number
  lastBuiltAt: number | null
  errorMessage: string | null
}

const defaultState: StorylineState = {
  status: "idle",
  storylines: [],
  selectedStorylineId: null,
  recentEntryCount: 0,
  embeddedRecentEntryCount: 0,
  analyzedRecentEntryCount: 0,
  embeddingRecordCount: 0,
  windowStartedAt: 0,
  lastBuiltAt: null,
  errorMessage: null,
}

export const useStorylineStore = createZustandStore<StorylineState>("storyline")(() => defaultState)

class StorylineActions {
  private refreshVersion = 0

  beginRefresh() {
    const version = ++this.refreshVersion
    useStorylineStore.setState({ status: "processing", errorMessage: null })
    return version
  }

  applyResult(version: number, result: StorylineBuildResult, embeddingRecordCount: number) {
    if (version !== this.refreshVersion) return false

    const currentSelection = useStorylineStore.getState().selectedStorylineId
    const selectedStorylineId = result.storylines.some(
      (storyline) => storyline.id === currentSelection,
    )
      ? currentSelection
      : (result.storylines[0]?.id ?? null)

    useStorylineStore.setState({
      ...result,
      status: "ready",
      selectedStorylineId,
      embeddingRecordCount,
      lastBuiltAt: Date.now(),
      errorMessage: null,
    })
    return true
  }

  failRefresh(version: number, error: unknown) {
    if (version !== this.refreshVersion) return false
    const errorMessage = error instanceof Error ? error.message : String(error)
    useStorylineStore.setState({
      status: "error",
      errorMessage,
    })
    return true
  }

  select(storylineId: string) {
    useStorylineStore.setState({ selectedStorylineId: storylineId })
  }

  getSelected(): Storyline | null {
    const state = useStorylineStore.getState()
    return state.storylines.find((storyline) => storyline.id === state.selectedStorylineId) ?? null
  }

  reset() {
    this.refreshVersion += 1
    useStorylineStore.setState(defaultState)
  }
}

export const storylineActions = new StorylineActions()
