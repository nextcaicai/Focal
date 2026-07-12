import { initializeDB, migrateDB } from "@follow/database/db"
import { LOCAL_RSS_MODE } from "@follow/shared/constants"

import { startDeferredStoreHydrate } from "./hydrate-deferred"
import type { HydratePerfReport } from "./hydrate-perf"
import {
  formatHydratePerfReport,
  measureHydrateStore,
  setLastHydratePerfReport,
} from "./hydrate-perf"
import type { Hydratable } from "./lib/base"
import { collectionActions } from "./modules/collection/store"
import { entryActions, useEntryStore } from "./modules/entry/store"
import { feedActions } from "./modules/feed/store"
import { inboxActions } from "./modules/inbox/store"
import { listActions } from "./modules/list/store"
import { subscriptionActions, useSubscriptionStore } from "./modules/subscription/store"
import { unreadActions } from "./modules/unread/store"
import { userActions } from "./modules/user/store"

/** Blocking startup hydrate — must finish before appIsReady. */
const criticalHydrates: Array<{ name: string; actions: Hydratable }> = [
  { name: "feed", actions: feedActions },
  { name: "subscription", actions: subscriptionActions },
  { name: "inbox", actions: inboxActions },
  { name: "list", actions: listActions },
  { name: "unread", actions: unreadActions },
  { name: "user", actions: userActions },
  { name: "entry", actions: entryActions },
  { name: "collection", actions: collectionActions },
]

/**
 * Recompute local RSS unread aggregates from the hydrated entry state so badges reflect
 * the same data that local timelines render.
 */
const reconcileLocalRssUnreadCounts = async () => {
  const entryData = useEntryStore.getState().data
  const subscriptionData = useSubscriptionStore.getState().data

  const unreadByFeedId: Record<string, number> = {}
  for (const entry of Object.values(entryData)) {
    if (!entry || entry.read) continue
    const { feedId } = entry
    if (!feedId) continue
    unreadByFeedId[feedId] = (unreadByFeedId[feedId] ?? 0) + 1
  }

  const updates = Object.keys(subscriptionData).map((feedId) => ({
    id: feedId,
    count: unreadByFeedId[feedId] ?? 0,
  }))

  if (updates.length > 0) {
    await unreadActions.upsertMany(updates, { reset: true })
  }
}

export const hydrateDatabaseToStore = async (options?: {
  migrateDatabase?: boolean
}): Promise<HydratePerfReport> => {
  const totalStart = performance.now()
  let dbInitMs: number | undefined
  let dbMigrateMs: number | undefined

  if (options?.migrateDatabase) {
    const initStart = performance.now()
    await initializeDB()
    dbInitMs = performance.now() - initStart

    const migrateStart = performance.now()
    await migrateDB()
    dbMigrateMs = performance.now() - migrateStart
  }

  const stores = await Promise.all(
    criticalHydrates.map(({ name, actions }) => measureHydrateStore(name, () => actions.hydrate())),
  )
  stores.sort((left, right) => right.ms - left.ms)

  let postLocalRssMs: number | undefined
  if (LOCAL_RSS_MODE) {
    const postStart = performance.now()
    await subscriptionActions.correctMisclassifiedVideoSubscriptions()
    await reconcileLocalRssUnreadCounts()
    postLocalRssMs = performance.now() - postStart
  }

  const report: HydratePerfReport = {
    totalMs: performance.now() - totalStart,
    dbInitMs,
    dbMigrateMs,
    stores,
    postLocalRssMs,
  }

  setLastHydratePerfReport(report)
  console.info(formatHydratePerfReport(report))

  void startDeferredStoreHydrate()

  return report
}

export {
  getDeferredStoreHydratePromise,
  getLastDeferredHydratePerfReport,
  isDeferredStoreHydrateComplete,
  startDeferredStoreHydrate,
} from "./hydrate-deferred"
export type { FormatHydratePerfReportOptions, HydratePerfReport } from "./hydrate-perf"
export { formatHydratePerfReport, getLastHydratePerfReport } from "./hydrate-perf"
