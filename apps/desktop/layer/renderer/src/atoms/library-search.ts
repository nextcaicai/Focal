import { EventBus } from "@follow/utils/event-bus"
import { atom } from "jotai"

import { createAtomHooks, jotaiStore } from "~/lib/jotai"

export type LibrarySearchScopeMode = "all" | "current"
export type LibrarySearchSort = "relevance" | "latest"

export type LibrarySearchPreviousScope = {
  feedId: string
}

type LibrarySearchSession = {
  query: string
  scopeMode: LibrarySearchScopeMode
  sort: LibrarySearchSort
  /** Route feedId when search became active (for restore + "current" scope). */
  previousScope: LibrarySearchPreviousScope | null
  /** feedId snapshot used when scopeMode is "current". */
  scopeSnapshotFeedId: string | null
}

const defaultSession = (): LibrarySearchSession => ({
  query: "",
  scopeMode: "all",
  sort: "relevance",
  previousScope: null,
  scopeSnapshotFeedId: null,
})

const librarySearchSessionAtom = atom<LibrarySearchSession>(defaultSession())

export const [, , useLibrarySearchSession, , getLibrarySearchSession, setLibrarySearchSession] =
  createAtomHooks(librarySearchSessionAtom)

export const useLibrarySearchQuery = () => useLibrarySearchSession().query
export const useLibrarySearchActive = () => useLibrarySearchSession().query.trim().length > 0

export const patchLibrarySearchSession = (patch: Partial<LibrarySearchSession>) => {
  setLibrarySearchSession({
    ...getLibrarySearchSession(),
    ...patch,
  })
}

/**
 * Activate or update search. Snapshots previous route scope only when entering
 * from idle (empty → non-empty query).
 */
export const setLibrarySearchQuery = (
  query: string,
  options?: { previousFeedId?: string | null },
) => {
  const next = query
  const prev = getLibrarySearchSession()
  const wasActive = prev.query.trim().length > 0
  const willBeActive = next.trim().length > 0

  if (!willBeActive) {
    setLibrarySearchSession({
      ...prev,
      query: next,
      previousScope: null,
      scopeSnapshotFeedId: null,
    })
    return
  }

  if (!wasActive) {
    const feedId = options?.previousFeedId ?? null
    setLibrarySearchSession({
      ...prev,
      query: next,
      previousScope: feedId ? { feedId } : null,
      scopeSnapshotFeedId: feedId,
    })
    return
  }

  setLibrarySearchSession({
    ...prev,
    query: next,
  })
}

export const clearLibrarySearch = () => {
  setLibrarySearchSession(defaultSession())
}

export const setLibrarySearchScopeMode = (scopeMode: LibrarySearchScopeMode) => {
  patchLibrarySearchSession({ scopeMode })
}

export const setLibrarySearchSort = (sort: LibrarySearchSort) => {
  patchLibrarySearchSession({ sort })
}

/** Focus the sidebar library search input (Cmd+K). */
export const LIBRARY_SEARCH_FOCUS_EVENT = "library-search:focus" as const

declare module "@follow/utils/event-bus" {
  interface EventBusMap {
    "library-search:focus": void
  }
}

export const focusLibrarySearchInput = () => {
  EventBus.dispatch(LIBRARY_SEARCH_FOCUS_EVENT)
}

/** For tests */
export const resetLibrarySearchSessionForTests = () => {
  jotaiStore.set(librarySearchSessionAtom, defaultSession())
}
