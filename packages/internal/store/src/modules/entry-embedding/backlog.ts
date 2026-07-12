import { getEntry } from "../entry/getter"
import { entryActions, useEntryStore } from "../entry/store"
import type { EntryModel } from "../entry/types"
import { getSubscriptionByEntryId } from "../subscription/getter"
import { hasEmbeddingEligibleText, isEmbeddingCurrentForEntry } from "./source-text"
import { entryEmbeddingActions } from "./store"

export type EmbeddingCoverageStats = {
  backlogCount: number
  coveredCount: number
  eligibleCount: number
}

/** Unread entries only — ingest-premarked read history is keyword-searchable without indexing. */
export const isEntryEmbeddingIndexingEligible = (entry: EntryModel): boolean => !entry.read

export const entryNeedsEmbedding = (entryId: string) => {
  const entry = getEntry(entryId)
  // Align with BYOK: index unread/active corpus only (see docs/embedding-search-governance.md).
  if (!entry) return false
  if (!getSubscriptionByEntryId(entryId)) return false
  if (!isEntryEmbeddingIndexingEligible(entry)) return false

  const existing = entryEmbeddingActions.getEmbedding(entryId)
  const sourceDeferred = entryActions.isEntryBodyDeferred(entryId)
  if (sourceDeferred) {
    // Metadata may be empty while the deferred body still contains the only eligible text.
    // A missing/hashless embedding must enter the pipeline so prepareEmbeddingWork can load it.
    return !existing || !isEmbeddingCurrentForEntry(entry, existing, { sourceDeferred: true })
  }

  if (!hasEmbeddingEligibleText(entry)) return false
  if (!existing) return true

  return !isEmbeddingCurrentForEntry(entry, existing, {
    // Metadata-only startup hydration intentionally leaves HTML bodies unloaded.
    // An existing full-body embedding cannot be judged stale until that body is available.
    sourceDeferred,
  })
}

export const countEmbeddingBacklog = (isInPipeline: (entryId: string) => boolean) => {
  const entries = Object.values(useEntryStore.getState().data)

  return entries.filter((entry) => {
    if (isInPipeline(entry.id)) return false

    return entryNeedsEmbedding(entry.id)
  }).length
}

export const getEmbeddingCoverageStats = (
  isInPipeline: (entryId: string) => boolean,
): EmbeddingCoverageStats => {
  const entries = Object.values(useEntryStore.getState().data)
  let eligibleCount = 0
  let coveredCount = 0
  let backlogCount = 0

  for (const entry of entries) {
    if (!getSubscriptionByEntryId(entry.id)) continue

    const sourceDeferred = entryActions.isEntryBodyDeferred(entry.id)
    if (!isEntryEmbeddingIndexingEligible(entry)) continue
    if (!sourceDeferred && !hasEmbeddingEligibleText(entry)) continue

    eligibleCount += 1
    const existing = entryEmbeddingActions.getEmbedding(entry.id)
    const isStale = existing
      ? !isEmbeddingCurrentForEntry(entry, existing, {
          sourceDeferred,
        })
      : true

    if (existing && !isStale) {
      coveredCount += 1
    }

    if (!isInPipeline(entry.id) && (!existing || isStale)) {
      backlogCount += 1
    }
  }

  return { backlogCount, coveredCount, eligibleCount }
}

/** Subscribed unread entries with embeddable text (or deferred body pending load). */
export const listRebuildEligibleEntryIds = () =>
  Object.values(useEntryStore.getState().data)
    .filter((entry) => getSubscriptionByEntryId(entry.id))
    .filter((entry) => isEntryEmbeddingIndexingEligible(entry))
    .filter(
      (entry) => entryActions.isEntryBodyDeferred(entry.id) || hasEmbeddingEligibleText(entry),
    )
    .map((entry) => entry.id)

/** Entries that still need a (re)embed, for non-destructive full-library backfill. */
export const listMissingEmbeddingEntryIds = () =>
  listRebuildEligibleEntryIds().filter((entryId) => entryNeedsEmbedding(entryId))
