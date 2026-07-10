import { FeedViewType } from "@follow/constants"
import type { CollectionSchema, EntrySchema, FeedSchema } from "@follow/database/schemas/types"
import { EntryService } from "@follow/database/services/entry"
import { applyLocalActionRulesToEntry, runLocalActionSideEffects } from "@follow/store/action/local"
import { useActionStore } from "@follow/store/action/store"
import { collectionActions } from "@follow/store/collection/store"
import { invalidateEntriesQuery } from "@follow/store/entry/hooks"
import { entryActions, entrySyncServices, useEntryStore } from "@follow/store/entry/store"
import { getFeedByIdOrUrl } from "@follow/store/feed/getter"
import { feedActions } from "@follow/store/feed/store"
import type { FeedModel } from "@follow/store/feed/types"
import { subscriptionActions, useSubscriptionStore } from "@follow/store/subscription/store"
import type { SubscriptionForm } from "@follow/store/subscription/types"
import { inferSubscriptionViewFromFeed } from "@follow/store/subscription/utils"
import { unreadActions } from "@follow/store/unread/store"
import { whoami } from "@follow/store/user/getters"
import { LOCAL_USER_ID } from "@follow/store/user/store"
import type { ParsedEntry } from "@follow-app/client-sdk"

import { getActionLanguage } from "~/atoms/settings/general"
import { ipcServices } from "~/lib/client"
import {
  triggerEntryEnrichmentFromIngest,
  triggerEntryRankFromIngest,
} from "~/modules/entry-enrichment/trigger"

import { isSupportedLocalRssUrl, LOCAL_RSS_URL_MESSAGE } from "./url"

export const LOCAL_RSS_DEFAULT_FEEDS_SEEDED_KEY = "local-rss:default-feeds-seeded"
/** One-shot migration: import RSS-window history for existing subscriptions. */
export const LOCAL_RSS_HISTORY_BACKFILL_V1_KEY = "local-rss:history-backfill-v1"
export const DEFAULT_LOCAL_RSS_FEED_URLS = [
  "https://api.xgo.ing/rss/user/edf707b5c0b248579085f66d7a3c5524",
  "https://rsshub.bestblogs.dev/xiaoyuzhou/podcast/626b46ea9cbbf0451cf5a962",
  "https://wechat2rss.bestblogs.dev/feed/c442206ec9957f3c52f2f40300ca532079538b31.xml",
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCcefcZRL2oaA_uBNeo5UOWg",
  "https://1q43.blog/feed",
] as const

/**
 * How many newest entries stay unread (and may enter the default AI pipeline)
 * on first subscription. Does NOT limit how many entries are stored.
 */
export const INITIAL_SUBSCRIPTION_UNREAD_COUNT = 5

export type LocalRssIngestReason = "initial" | "refresh" | "historyBackfill"

export type RefreshLocalRssFeedResult = {
  feed: FeedSchema
  entries: EntrySchema[]
  /** Entry ids that were not already in local store/DB before this ingest. */
  newlyIngestedCount: number
}

const toDate = (value: Date | string | null | undefined) => {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

const normalizeFeed = (feed: RssPreviewFeed): FeedSchema => ({
  ...feed,
  updatedAt: toDate(feed.updatedAt),
})

/**
 * Legacy per-feed cutoff used to drop older window entries from ingest.
 * P0 no longer discards by cutoff; we clear it on initial/backfill so old
 * restrictive values do not block corpus growth if any residual checks remain.
 */
const getHistoricalCutoffKey = (feedId: string) => `local-rss:history-cutoff:${feedId}`

const clearHistoricalCutoff = (feedId: string) => {
  try {
    localStorage.removeItem(getHistoricalCutoffKey(feedId))
  } catch {
    // Ignore storage failures.
  }
}

const normalizeEntry = (entry: RssPreviewEntry): EntrySchema => {
  const existingEntry = useEntryStore.getState().data[entry.id]

  return {
    ...entry,
    insertedAt: toDate(entry.insertedAt) ?? new Date(),
    publishedAt: toDate(entry.publishedAt) ?? new Date(),
    readabilityUpdatedAt: toDate(entry.readabilityUpdatedAt),
    read: existingEntry?.read ?? entry.read,
  }
}

const sortEntriesByPublishedDesc = (entries: EntrySchema[]) =>
  [...entries].sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))

const collectKnownEntryIds = async (entryIds: string[]) => {
  const storeData = useEntryStore.getState().data
  const known = new Set<string>()
  const missingFromStore: string[] = []

  for (const id of entryIds) {
    if (storeData[id]) {
      known.add(id)
    } else {
      missingFromStore.push(id)
    }
  }

  if (missingFromStore.length > 0) {
    const persisted = await EntryService.getEntryMany(missingFromStore)
    for (const entry of persisted) {
      known.add(entry.id)
    }
  }

  return known
}

const mergeStoredEntryState = async (entries: EntrySchema[]) => {
  if (entries.length === 0) return entries

  const storeData = useEntryStore.getState().data
  const entryIdsMissingFromStore = entries
    .filter((entry) => !storeData[entry.id])
    .map((entry) => entry.id)
  const persistedEntries =
    entryIdsMissingFromStore.length > 0
      ? await EntryService.getEntryMany(entryIdsMissingFromStore)
      : []
  const persistedEntryById = new Map(persistedEntries.map((entry) => [entry.id, entry]))

  return entries.map((entry) => {
    const storedEntry = storeData[entry.id] ?? persistedEntryById.get(entry.id)
    if (!storedEntry) return entry

    return {
      ...entry,
      insertedAt: storedEntry.insertedAt ?? entry.insertedAt,
      content: entry.content ?? storedEntry.content,
      readabilityContent: storedEntry.readabilityContent ?? entry.readabilityContent,
      readabilityUpdatedAt: storedEntry.readabilityUpdatedAt ?? entry.readabilityUpdatedAt,
      read: storedEntry.read ?? entry.read,
      settings: entry.settings ?? storedEntry.settings,
    }
  })
}

const toPreviewEntry = (entry: EntrySchema): ParsedEntry => {
  const { feedId: _feedId, content: _content, insertedAt: _insertedAt, ...previewEntry } = entry
  return previewEntry as unknown as ParsedEntry
}

const assertRssService = () => {
  if (!ipcServices?.rss?.preview) {
    throw new Error("Local RSS requires the Electron app runtime")
  }

  return ipcServices.rss
}

type RssPreviewResult = Awaited<ReturnType<ReturnType<typeof assertRssService>["preview"]>>
type RssPreviewFeed = RssPreviewResult["feed"]
type RssPreviewEntry = RssPreviewResult["entries"][number]

const requestPreview = async (
  url: string,
  options?: {
    lite?: boolean
    limit?: number
  },
) => {
  if (!isSupportedLocalRssUrl(url)) {
    throw new Error(LOCAL_RSS_URL_MESSAGE)
  }

  const rss = assertRssService()
  return rss.preview({ url, ...options })
}

export async function previewLocalRssFeed({ id, url }: { id?: string; url?: string }) {
  const existingFeed = getFeedByIdOrUrl({ id, url })
  const feedUrl = url || existingFeed?.url

  if (!feedUrl) {
    throw new Error("RSS URL is required")
  }

  const result = await requestPreview(feedUrl, { lite: true })
  const feed = normalizeFeed(result.feed)
  const entries = result.entries.map(normalizeEntry)

  feedActions.upsertManyInSession([feed])

  return {
    feed,
    entries: entries.map(toPreviewEntry),
    subscription: undefined,
    analytics: {
      feedId: feed.id,
      view: null,
      subscriptionCount: null,
      updatesPerWeek: null,
      latestEntryPublishedAt: feed.latestEntryPublishedAt ?? null,
      independentSubscriptionCount: null,
      activeSubscriptionCount: null,
      boostPoints: null,
    },
  }
}

const syncUnreadCountForFeed = async (feedId: string) => {
  const entries = Object.values(useEntryStore.getState().data)
  const unreadCount = entries.reduce((count, entry) => {
    if (entry.feedId !== feedId || entry.read) {
      return count
    }
    return count + 1
  }, 0)

  await unreadActions.updateById(feedId, unreadCount)
}

const applyLocalActionsToEntries = async ({
  entries,
  feed,
}: {
  entries: EntrySchema[]
  feed: FeedModel
}) => {
  const { rules } = useActionStore.getState()
  const subscription = useSubscriptionStore.getState().data[feed.id]
  const view = subscription?.view
  if (rules.length === 0) {
    return {
      entries,
      sideEffects: [],
      starredCollections: [],
      view,
    }
  }

  const nextEntries: EntrySchema[] = []
  const starredCollections: CollectionSchema[] = []
  const sideEffects: Array<ReturnType<typeof applyLocalActionRulesToEntry>> = []

  for (const entry of entries) {
    const result = applyLocalActionRulesToEntry(entry, {
      feed,
      subscription,
      view,
      rules,
    })
    sideEffects.push(result)

    if (result.blocked) continue

    if (result.starred) {
      starredCollections.push({
        createdAt: new Date().toISOString(),
        entryId: result.entry.id,
        feedId: result.entry.feedId,
        view: view ?? 0,
      })
    }
    nextEntries.push(result.entry)
  }

  return {
    entries: nextEntries,
    sideEffects,
    starredCollections,
    view,
  }
}

const resolveIngestReason = (options?: {
  isInitialSubscription?: boolean
  reason?: LocalRssIngestReason
}): LocalRssIngestReason => {
  if (options?.reason) return options.reason
  if (options?.isInitialSubscription) return "initial"
  return "refresh"
}

/**
 * Fetch a feed and upsert entries into the local DB.
 *
 * Ingest depth, unread policy, and enrichment are separate:
 * - initial: full RSS window in DB; newest N unread + enrichable; rest read, no AI
 * - refresh: full window; only newly seen entries unread + enrichable
 * - historyBackfill: full window; newly seen entries forced read; no AI
 */
export async function refreshLocalRssFeed(
  feed: Pick<FeedModel, "id" | "url">,
  options?: {
    /**
     * @deprecated Prefer `reason: "initial"`. Kept for call-site compatibility.
     */
    isInitialSubscription?: boolean
    reason?: LocalRssIngestReason
  },
): Promise<RefreshLocalRssFeedResult> {
  const reason = resolveIngestReason(options)
  const result = await requestPreview(feed.url)
  const nextFeed = normalizeFeed(result.feed)
  let entries = result.entries.map(normalizeEntry)

  // Always keep the full current RSS window (no soft cap).
  entries = sortEntriesByPublishedDesc(entries)

  const knownEntryIds = await collectKnownEntryIds(entries.map((entry) => entry.id))
  const newlySeenIds = new Set(
    entries.filter((entry) => !knownEntryIds.has(entry.id)).map((e) => e.id),
  )

  let unreadIdsForEnrichment: Set<string> | undefined

  if (reason === "initial") {
    // Newest N unread for timeline + AI; everything else stored as read.
    const sorted = entries
    unreadIdsForEnrichment = new Set(
      sorted.slice(0, INITIAL_SUBSCRIPTION_UNREAD_COUNT).map((entry) => entry.id),
    )
    entries = sorted.map((entry) => ({
      ...entry,
      read: unreadIdsForEnrichment!.has(entry.id) ? false : true,
    }))
    clearHistoricalCutoff(feed.id)
  } else if (reason === "historyBackfill") {
    // Import missing window entries as read; never flood timeline or BYOK.
    entries = entries.map((entry) => {
      if (knownEntryIds.has(entry.id)) return entry
      return { ...entry, read: true }
    })
    clearHistoricalCutoff(feed.id)
  }
  // reason === "refresh": do not drop older window items; merge keeps read state;
  // brand-new ids stay unread (feed default read:false) and get enrichment below.

  const nextFeedWithIdentity = {
    ...nextFeed,
    id: feed.id,
    url: feed.url,
    errorAt: null,
    errorMessage: null,
  }

  await feedActions.upsertMany([nextFeedWithIdentity])
  const entriesWithFeedId = await mergeStoredEntryState(
    entries.map((entry) => ({ ...entry, feedId: feed.id })),
  )

  // Re-apply unread / history policy after merge (merge prefers stored read state).
  const finalEntries = (() => {
    if (reason === "initial" && unreadIdsForEnrichment) {
      return entriesWithFeedId.map((entry) => ({
        ...entry,
        read: !unreadIdsForEnrichment!.has(entry.id),
      }))
    }
    if (reason === "historyBackfill") {
      return entriesWithFeedId.map((entry) =>
        newlySeenIds.has(entry.id) ? { ...entry, read: true } : entry,
      )
    }
    return entriesWithFeedId
  })()

  const actionResult = await applyLocalActionsToEntries({
    entries: finalEntries,
    feed: {
      ...nextFeedWithIdentity,
      type: "feed",
    },
  })
  if (actionResult.starredCollections.length > 0) {
    await collectionActions.upsertMany(actionResult.starredCollections)
  }
  await entryActions.upsertMany(actionResult.entries)
  const ingestedEntryIds = actionResult.entries.map((entry) => entry.id)

  if (reason === "historyBackfill") {
    // Corpus only — no BYOK. Rank may still help if scores are cheap/local.
    triggerEntryRankFromIngest(ingestedEntryIds.filter((id) => newlySeenIds.has(id)))
  } else if (reason === "initial" && unreadIdsForEnrichment) {
    const enrichIds = ingestedEntryIds.filter((id) => unreadIdsForEnrichment!.has(id))
    triggerEntryEnrichmentFromIngest(enrichIds)
    triggerEntryRankFromIngest(ingestedEntryIds)
  } else {
    // refresh: enrich only newly seen entries to avoid re-queueing the full window
    const enrichIds = ingestedEntryIds.filter((id) => newlySeenIds.has(id))
    triggerEntryEnrichmentFromIngest(enrichIds)
    triggerEntryRankFromIngest(enrichIds)
  }

  void Promise.all(
    actionResult.sideEffects.map((result) =>
      runLocalActionSideEffects(result, {
        actionLanguage: getActionLanguage(),
        feed: {
          ...nextFeedWithIdentity,
          type: "feed",
        },
        view: actionResult.view,
        fetchReadabilityContent: async (entry) => {
          const content = await entrySyncServices.fetchEntryReadabilityContent(entry.id)
          if (!content) {
            throw new Error("No readability content returned.")
          }
        },
      }),
    ),
  )
  await syncUnreadCountForFeed(feed.id)

  return {
    feed: nextFeedWithIdentity,
    entries: actionResult.entries,
    newlyIngestedCount: newlySeenIds.size,
  }
}

export async function upsertLocalRssSubscription({
  feed,
  subscription,
}: {
  feed: FeedModel
  subscription: SubscriptionForm
}) {
  const userId = whoami()?.id ?? LOCAL_USER_ID
  const subscriptionView = Number(subscription.view)
  const inferredView = inferSubscriptionViewFromFeed(feed)
  const view = inferredView === FeedViewType.Videos ? inferredView : subscriptionView

  await subscriptionActions.upsertMany([
    {
      ...subscription,
      title: subscription.title ?? null,
      category: subscription.category ?? null,
      type: "feed",
      createdAt: new Date().toISOString(),
      feedId: feed.id,
      listId: null,
      inboxId: null,
      userId,
      view,
      isPrivate: subscription.isPrivate,
      hideFromTimeline: subscription.hideFromTimeline ?? null,
    },
  ])

  await refreshLocalRssFeed(feed, { reason: "initial" })
  await invalidateEntriesQuery({ views: [view] })
}

/**
 * Import all entries currently available in the feed window that are missing
 * locally. Imported entries are read and do not trigger AI enrichment.
 */
export async function importAvailableHistoryForFeed(
  feed: Pick<FeedModel, "id" | "url">,
): Promise<RefreshLocalRssFeedResult> {
  return refreshLocalRssFeed(feed, { reason: "historyBackfill" })
}

const readDefaultFeedsSeeded = () => {
  try {
    return localStorage.getItem(LOCAL_RSS_DEFAULT_FEEDS_SEEDED_KEY) === "1"
  } catch {
    return false
  }
}

const writeDefaultFeedsSeeded = () => {
  try {
    localStorage.setItem(LOCAL_RSS_DEFAULT_FEEDS_SEEDED_KEY, "1")
  } catch {
    // Ignore storage failures; existing subscriptions still prevent duplicate seeding.
  }
}

const readHistoryBackfillV1Done = () => {
  try {
    return localStorage.getItem(LOCAL_RSS_HISTORY_BACKFILL_V1_KEY) === "done"
  } catch {
    return false
  }
}

const writeHistoryBackfillV1Done = () => {
  try {
    localStorage.setItem(LOCAL_RSS_HISTORY_BACKFILL_V1_KEY, "done")
  } catch {
    // Ignore; next startup will retry.
  }
}

const hasExistingLocalRssSubscriptions = () =>
  Object.values(useSubscriptionStore.getState().data).some(
    (subscription) => subscription.type === "feed" && !!subscription.feedId,
  )

export async function seedDefaultLocalRssFeedsIfNeeded(): Promise<{
  seeded: boolean
  successCount: number
  failureCount: number
}> {
  if (readDefaultFeedsSeeded()) {
    return { seeded: false, successCount: 0, failureCount: 0 }
  }

  if (hasExistingLocalRssSubscriptions()) {
    writeDefaultFeedsSeeded()
    return { seeded: false, successCount: 0, failureCount: 0 }
  }

  let successCount = 0
  let failureCount = 0

  for (const url of DEFAULT_LOCAL_RSS_FEED_URLS) {
    try {
      const { feed } = await previewLocalRssFeed({ url })
      const feedModel = {
        ...feed,
        type: "feed" as const,
      }
      await upsertLocalRssSubscription({
        feed: feedModel,
        subscription: {
          url: feed.url,
          view: FeedViewType.Articles,
          category: null,
          isPrivate: false,
          hideFromTimeline: null,
          title: feed.title,
          feedId: feed.id,
          listId: undefined,
        },
      })
      successCount += 1
    } catch (error) {
      failureCount += 1
      console.warn("[local-rss] Failed to seed default feed", { url, error })
    }
  }

  if (successCount > 0) {
    writeDefaultFeedsSeeded()
  }

  return { seeded: successCount > 0, successCount, failureCount }
}

export async function refreshAllLocalRssFeeds(): Promise<{
  successCount: number
  failureCount: number
}> {
  const subscriptions = Object.values(useSubscriptionStore.getState().data).filter(
    (subscription) => subscription.type === "feed" && subscription.feedId,
  )

  let successCount = 0
  let failureCount = 0

  for (const subscription of subscriptions) {
    const feed = getFeedByIdOrUrl({ id: subscription.feedId ?? undefined })
    if (!feed?.id || !feed.url) continue

    try {
      await refreshLocalRssFeed(feed, { reason: "refresh" })
      successCount += 1
    } catch (error) {
      failureCount += 1
      await feedActions.patch(feed.id, {
        errorAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : "Failed to refresh RSS feed",
      })
    }
  }

  return { successCount, failureCount }
}

export type HistoryBackfillResult = {
  /** False when migration already completed (flag set). */
  ran: boolean
  feedCount: number
  successCount: number
  failureCount: number
  newlyIngestedCount: number
}

/**
 * One-shot upgrade migration: for every local feed subscription, import the
 * current RSS window's missing entries as read without AI.
 * Silent; caller shows a light toast when ran && newlyIngestedCount path as needed.
 */
export async function backfillAvailableHistoryForExistingSubscriptions(options?: {
  /** When true, run even if the v1 done flag is set (manual full retry). */
  force?: boolean
}): Promise<HistoryBackfillResult> {
  if (!options?.force && readHistoryBackfillV1Done()) {
    return {
      ran: false,
      feedCount: 0,
      successCount: 0,
      failureCount: 0,
      newlyIngestedCount: 0,
    }
  }

  const subscriptions = Object.values(useSubscriptionStore.getState().data).filter(
    (subscription) => subscription.type === "feed" && subscription.feedId,
  )

  let successCount = 0
  let failureCount = 0
  let newlyIngestedCount = 0
  let feedCount = 0

  for (const subscription of subscriptions) {
    const feed = getFeedByIdOrUrl({ id: subscription.feedId ?? undefined })
    if (!feed?.id || !feed.url) continue

    feedCount += 1
    try {
      const result = await importAvailableHistoryForFeed(feed)
      successCount += 1
      newlyIngestedCount += result.newlyIngestedCount
    } catch (error) {
      failureCount += 1
      console.warn("[local-rss] History backfill failed for feed", {
        feedId: feed.id,
        url: feed.url,
        error,
      })
    }
  }

  // Mark done even with partial failures so we do not hammer every startup;
  // users can re-run per feed via "Import available history".
  writeHistoryBackfillV1Done()

  return {
    ran: true,
    feedCount,
    successCount,
    failureCount,
    newlyIngestedCount,
  }
}

/** Mark the one-shot history backfill as completed (e.g. after fresh seed). */
export const markHistoryBackfillV1Done = () => {
  writeHistoryBackfillV1Done()
}

/** Test helper: clear the v1 backfill done flag. */
export const resetHistoryBackfillV1FlagForTests = () => {
  try {
    localStorage.removeItem(LOCAL_RSS_HISTORY_BACKFILL_V1_KEY)
  } catch {
    // ignore
  }
}
