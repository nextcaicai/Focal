import { EventBus } from "@follow/utils/event-bus"
import { atom } from "jotai"

import { createAtomHooks, jotaiStore } from "~/lib/jotai"

export type LibrarySearchPreviousScope = {
  feedId: string
}

type LibrarySearchSession = {
  query: string
  /** Route feedId when search became active (for restore on clear). */
  previousScope: LibrarySearchPreviousScope | null
}

const defaultSession = (): LibrarySearchSession => ({
  query: "",
  previousScope: null,
})

const librarySearchSessionAtom = atom<LibrarySearchSession>(defaultSession())

/** Latest ranked search ids (capped for list rendering). Updated by useLibrarySearchEntryIds only. */
export const librarySearchEntryIdsAtom = atom<string[]>([])

/** Full hit count before display cap — for header title. */
export const librarySearchTotalHitsAtom = atom(0)

export const [, , useLibrarySearchSession, , getLibrarySearchSession, setLibrarySearchSession] =
  createAtomHooks(librarySearchSessionAtom)

export const [, , useLibrarySearchTotalHits, useSetLibrarySearchTotalHits] = createAtomHooks(
  librarySearchTotalHitsAtom,
)

export const [, , , useSetLibrarySearchEntryIds] = createAtomHooks(librarySearchEntryIdsAtom)

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
    })
    return
  }

  if (!wasActive) {
    const feedId = options?.previousFeedId ?? null
    setLibrarySearchSession({
      ...prev,
      query: next,
      previousScope: feedId ? { feedId } : null,
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
  jotaiStore.set(librarySearchEntryIdsAtom, [])
  jotaiStore.set(librarySearchTotalHitsAtom, 0)
}
