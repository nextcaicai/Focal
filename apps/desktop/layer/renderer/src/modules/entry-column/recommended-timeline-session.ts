import { atom } from "jotai"
import { useLayoutEffect, useMemo } from "react"

import { createAtomHooks } from "~/lib/jotai"

export const RECOMMENDED_TIMELINE_NOTICE_ENTRY_LIMIT = 30
export const RECOMMENDED_TIMELINE_SESSION_TTL_MS = 10 * 60 * 1000

export interface RecommendedTimelineSession {
  active: boolean
  hasSnapshot: boolean
  lastLeftAt: number | null
  latestEntryIds: string[]
  manualRefreshIds: number[]
  updatePending: boolean
  visibleEntryIds: string[]
}

export interface ReconcileRecommendedTimelineSessionInput {
  active: boolean
  latestEntryIds: readonly string[]
  now: number
  sourceEntryIds: readonly string[]
  immediateRemovalEntryIds?: readonly string[]
}

export const createRecommendedTimelineSession = (): RecommendedTimelineSession => ({
  active: false,
  hasSnapshot: false,
  lastLeftAt: null,
  latestEntryIds: [],
  manualRefreshIds: [],
  updatePending: false,
  visibleEntryIds: [],
})

export const applyRecommendedTimelineUpdate = (
  session: RecommendedTimelineSession,
): RecommendedTimelineSession => {
  if (!session.active || !session.hasSnapshot) return session

  return {
    ...session,
    updatePending: false,
    visibleEntryIds: session.latestEntryIds,
  }
}

export const getVisibleRecommendedTimelineEntryIds = (
  snapshotEntryIds: readonly string[],
  {
    immediateRemovalEntryIds = [],
    sourceEntryIds,
  }: {
    immediateRemovalEntryIds?: readonly string[]
    sourceEntryIds: readonly string[]
  },
) => {
  const sourceEntryIdSet = new Set(sourceEntryIds)
  const immediateRemovalEntryIdSet = new Set(immediateRemovalEntryIds)
  return snapshotEntryIds.filter(
    (entryId) => sourceEntryIdSet.has(entryId) && !immediateRemovalEntryIdSet.has(entryId),
  )
}

const hasVisibleRecommendationChanges = (
  visibleEntryIds: readonly string[],
  latestEntryIds: readonly string[],
) => {
  const visible = visibleEntryIds.slice(0, RECOMMENDED_TIMELINE_NOTICE_ENTRY_LIMIT)
  const latest = latestEntryIds.slice(0, RECOMMENDED_TIMELINE_NOTICE_ENTRY_LIMIT)

  if (visible.length !== latest.length) return true
  return visible.some((entryId, index) => entryId !== latest[index])
}

const areEntryIdsEqual = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((entryId, index) => entryId === right[index])

export const reconcileRecommendedTimelineSession = (
  session: RecommendedTimelineSession,
  {
    active,
    latestEntryIds,
    now,
    sourceEntryIds,
    immediateRemovalEntryIds = [],
  }: ReconcileRecommendedTimelineSessionInput,
): RecommendedTimelineSession => {
  if (!active) {
    if (!session.active) return session

    return {
      ...session,
      active: false,
      lastLeftAt: now,
      manualRefreshIds: [],
    }
  }

  const sourceEntryIdSet = new Set(sourceEntryIds)
  const immediateRemovalEntryIdSet = new Set(immediateRemovalEntryIds)
  const canDisplay = (entryId: string) =>
    sourceEntryIdSet.has(entryId) && !immediateRemovalEntryIdSet.has(entryId)
  const nextLatestEntryIds = latestEntryIds.filter(canDisplay)
  const returningAfterExpiry =
    !session.active &&
    session.lastLeftAt !== null &&
    now - session.lastLeftAt >= RECOMMENDED_TIMELINE_SESSION_TTL_MS

  if (!session.hasSnapshot || returningAfterExpiry) {
    return {
      active: true,
      hasSnapshot: true,
      lastLeftAt: null,
      latestEntryIds: nextLatestEntryIds,
      manualRefreshIds: [],
      updatePending: false,
      visibleEntryIds: nextLatestEntryIds,
    }
  }

  if (session.manualRefreshIds.length > 0) {
    if (
      session.active &&
      session.lastLeftAt === null &&
      session.updatePending === false &&
      areEntryIdsEqual(session.latestEntryIds, nextLatestEntryIds) &&
      areEntryIdsEqual(session.visibleEntryIds, nextLatestEntryIds)
    ) {
      return session
    }

    return {
      ...session,
      active: true,
      lastLeftAt: null,
      latestEntryIds: nextLatestEntryIds,
      updatePending: false,
      visibleEntryIds: nextLatestEntryIds,
    }
  }

  const displayedEntryIds = getVisibleRecommendedTimelineEntryIds(session.visibleEntryIds, {
    immediateRemovalEntryIds,
    sourceEntryIds,
  })
  const updatePending = hasVisibleRecommendationChanges(displayedEntryIds, nextLatestEntryIds)
  if (
    session.active &&
    session.lastLeftAt === null &&
    session.updatePending === updatePending &&
    areEntryIdsEqual(session.latestEntryIds, nextLatestEntryIds)
  ) {
    return session
  }

  return {
    ...session,
    active: true,
    lastLeftAt: null,
    latestEntryIds: nextLatestEntryIds,
    updatePending,
  }
}

const [
  ,
  useRecommendedTimelineSessionAtom,
  useRecommendedTimelineSessionValue,
  ,
  ,
  setRecommendedTimelineSession,
] = createAtomHooks(atom(createRecommendedTimelineSession()))

export const requestRecommendedTimelineUpdate = () => {
  setRecommendedTimelineSession((session) => applyRecommendedTimelineUpdate(session))
}

let nextRecommendedTimelineRefreshId = 0

export const beginRecommendedTimelineRefresh = () => {
  const refreshId = ++nextRecommendedTimelineRefreshId
  setRecommendedTimelineSession((session) => {
    const updatedSession = applyRecommendedTimelineUpdate(session)
    if (!updatedSession.active || !updatedSession.hasSnapshot) return updatedSession

    return {
      ...updatedSession,
      manualRefreshIds: [...updatedSession.manualRefreshIds, refreshId],
    }
  })
  return refreshId
}

export const finishRecommendedTimelineRefresh = (refreshId: number) => {
  setRecommendedTimelineSession((session) => {
    if (!session.manualRefreshIds.includes(refreshId)) return session

    return {
      ...session,
      manualRefreshIds: session.manualRefreshIds.filter((id) => id !== refreshId),
    }
  })
}

export const resetRecommendedTimelineSession = () => {
  setRecommendedTimelineSession(createRecommendedTimelineSession())
}

export const useRecommendedTimelineSession = useRecommendedTimelineSessionValue

export const useStableRecommendedTimelineEntryIds = ({
  active,
  immediateRemovalEntryIds,
  latestEntryIds,
  sourceEntryIds,
  suspended = false,
}: {
  active: boolean
  immediateRemovalEntryIds?: readonly string[]
  latestEntryIds: readonly string[]
  sourceEntryIds: readonly string[]
  suspended?: boolean
}) => {
  const [session, setSession] = useRecommendedTimelineSessionAtom()

  useLayoutEffect(() => {
    if (suspended) return

    setSession((currentSession) =>
      reconcileRecommendedTimelineSession(currentSession, {
        active,
        immediateRemovalEntryIds,
        latestEntryIds,
        now: Date.now(),
        sourceEntryIds,
      }),
    )
  }, [active, immediateRemovalEntryIds, latestEntryIds, setSession, sourceEntryIds, suspended])

  useLayoutEffect(() => {
    if (!active) return

    return () => {
      setSession((currentSession) =>
        reconcileRecommendedTimelineSession(currentSession, {
          active: false,
          latestEntryIds: [],
          now: Date.now(),
          sourceEntryIds: [],
        }),
      )
    }
  }, [active, setSession])

  const visibleEntryIds = useMemo(
    () =>
      getVisibleRecommendedTimelineEntryIds(session.visibleEntryIds, {
        immediateRemovalEntryIds,
        sourceEntryIds,
      }),
    [immediateRemovalEntryIds, session.visibleEntryIds, sourceEntryIds],
  )

  if (!active || !session.hasSnapshot) return latestEntryIds as string[]
  return visibleEntryIds
}
