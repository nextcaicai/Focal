import { embeddingBatchGenerator } from "../../context"
import { getEntry } from "../entry/getter"
import { getSubscriptionByEntryId } from "../subscription/getter"
import {
  entryNeedsEmbedding,
  getEmbeddingCoverageStats,
  listMissingEmbeddingEntryIds,
  listRebuildEligibleEntryIds,
} from "./backlog"
import { embeddingJobStatusActions } from "./status-store"
import { entryEmbeddingActions, entryEmbeddingSyncService } from "./store"

/** Texts per OpenAI-compatible /embeddings request (SiliconFlow bge-m3 verified). */
export const EMBEDDING_API_BATCH_SIZE = 32
/** Concurrent batch API calls while draining the queue. */
const PARALLEL_BATCH_REQUESTS = 2
/** Legacy single-entry queue chunk when batch generator is unavailable. */
const LEGACY_QUEUE_BATCH_SIZE = 8
const LEGACY_CONCURRENCY = 8
const JOB_TIMEOUT_MS = 90_000
const BATCH_JOB_TIMEOUT_MS = 120_000
const STALE_PENDING_MS = 90_000

export type EmbeddingJobEnqueueOptions = {
  entryIds: string[]
  prepend?: boolean
}

/** Split a queue chunk into fixed-size API batches for parallel requests. */
export const splitEmbeddingApiBatches = (
  entryIds: readonly string[],
  batchSize: number = EMBEDDING_API_BATCH_SIZE,
): string[][] => {
  if (batchSize <= 0) return []

  const batches: string[][] = []
  for (let index = 0; index < entryIds.length; index += batchSize) {
    batches.push(entryIds.slice(index, index + batchSize))
  }
  return batches
}

/** Keep first occurrence order; drop later duplicates. Pure helper for tests. */
export const dedupeQueuePreserveOrder = (queue: readonly string[]): string[] => {
  const seen = new Set<string>()
  const next: string[] = []
  for (const id of queue) {
    if (seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  return next
}

class EntryEmbeddingJobService {
  private queue: string[] = []
  /** IDs waiting in queue or currently executing — O(1) membership for enqueue dedupe. */
  private inFlightIds = new Set<string>()
  private pendingSince = new Map<string, number>()
  private activeJobs = new Map<string, { entryId: string; startedAt: string }>()
  private cancelledActiveEntryIds = new Set<string>()
  private isDraining = false
  private lastError: { entryId: string; message: string; at: string } | null = null

  enqueueFromIngest(options: EmbeddingJobEnqueueOptions) {
    this.enqueueMissing({
      ...options,
      prepend: true,
    })
  }

  backfillVisible(options: EmbeddingJobEnqueueOptions) {
    this.enqueueMissing(options)
  }

  /**
   * Queue every subscribed entry that still needs an embedding (read + unread).
   * Does not wipe existing vectors — only fills gaps / refreshes stale hashes.
   */
  enqueueAllMissing() {
    const entryIds = listMissingEmbeddingEntryIds()
    if (entryIds.length === 0) {
      // Still compact any historically bloated queue.
      this.compactQueueIfNeeded()
      this.publishStatus()
      return 0
    }

    this.enqueueMissing({ entryIds })
    return entryIds.length
  }

  async rebuildAll() {
    const entryIds = listRebuildEligibleEntryIds()
    if (entryIds.length === 0) return 0

    await entryEmbeddingActions.reset()
    this.enqueueMissing({ entryIds, prepend: true })
    return entryIds.length
  }

  isEntryInPipeline(entryId: string) {
    if (this.inFlightIds.has(entryId)) return true
    if (this.activeJobs.has(entryId)) return true
    return this.isPending(entryId)
  }

  cancelEntriesByFeedIds(feedIds: string[]) {
    const feedIdSet = new Set(feedIds.filter(Boolean))
    if (feedIdSet.size === 0) return 0

    let cancelledCount = 0

    this.queue = this.queue.filter((entryId) => {
      if (!this.isEntryFromFeedIds(entryId, feedIdSet)) return true

      this.inFlightIds.delete(entryId)
      this.clearPending(entryId)
      cancelledCount += 1
      return false
    })

    for (const entryId of this.pendingSince.keys()) {
      if (this.activeJobs.has(entryId)) continue
      if (!this.isEntryFromFeedIds(entryId, feedIdSet)) continue

      this.clearPending(entryId)
    }

    for (const entryId of this.activeJobs.keys()) {
      if (!this.isEntryFromFeedIds(entryId, feedIdSet)) continue

      this.cancelledActiveEntryIds.add(entryId)
      cancelledCount += 1
    }

    if (cancelledCount > 0) {
      this.publishStatus()
    }

    return cancelledCount
  }

  getCoverageStats() {
    return getEmbeddingCoverageStats((entryId) => this.isEntryInPipeline(entryId))
  }

  /** Test helper: wipe in-memory queue state. */
  resetForTest() {
    this.queue = []
    this.inFlightIds.clear()
    this.pendingSince.clear()
    this.activeJobs.clear()
    this.cancelledActiveEntryIds.clear()
    this.isDraining = false
    this.lastError = null
    this.publishStatus()
  }

  private enqueueMissing({ entryIds, prepend = false }: EmbeddingJobEnqueueOptions) {
    // Heal queues bloated by historical re-enqueue after pending TTL expiry.
    this.compactQueueIfNeeded()

    const jobs = this.buildJobs(entryIds)
    if (jobs.length === 0) {
      this.publishStatus()
      return
    }

    for (const entryId of jobs) {
      this.inFlightIds.add(entryId)
    }

    if (prepend) {
      this.queue.unshift(...jobs)
    } else {
      this.queue.push(...jobs)
    }
    this.publishStatus()
    void this.drain()
  }

  /**
   * Drop duplicate entryIds already sitting in the queue (keep first).
   * Returns true when the queue shrank.
   */
  private compactQueueIfNeeded() {
    const before = this.queue.length
    if (before <= 1) return false

    const compact = dedupeQueuePreserveOrder(this.queue)
    if (compact.length === before) return false

    this.queue = compact
    this.rebuildInFlightFromQueueAndActive()
    return true
  }

  private rebuildInFlightFromQueueAndActive() {
    this.inFlightIds = new Set(this.queue)
    for (const entryId of this.activeJobs.keys()) {
      this.inFlightIds.add(entryId)
    }
  }

  private publishStatus() {
    const coverage = this.getCoverageStats()

    embeddingJobStatusActions.setSnapshot({
      queueLength: this.queue.length,
      pendingCount: this.pendingSince.size,
      isProcessing: this.isDraining,
      activeJobs: Array.from(this.activeJobs.values()),
      lastError: this.lastError,
      backlogCount: coverage.backlogCount,
      coveredCount: coverage.coveredCount,
      eligibleCount: coverage.eligibleCount,
    })
  }

  private buildJobs(entryIds: string[]) {
    const jobs: string[] = []
    const seenIds = new Set<string>()

    for (const entryId of entryIds) {
      if (seenIds.has(entryId)) continue
      seenIds.add(entryId)

      // Hard dedupe: already queued or running (independent of pending TTL).
      if (this.inFlightIds.has(entryId) || this.activeJobs.has(entryId)) continue
      if (this.isPending(entryId)) continue
      if (!this.isEntryStillSubscribed(entryId)) continue
      if (!entryNeedsEmbedding(entryId)) continue

      this.markPending(entryId)
      jobs.push(entryId)
    }

    return jobs
  }

  private async drain() {
    if (this.isDraining) return

    this.isDraining = true
    this.publishStatus()
    try {
      if (embeddingBatchGenerator()) {
        await this.drainWithApiBatches()
      } else {
        await this.drainLegacySingle()
      }
    } finally {
      this.isDraining = false
      this.publishStatus()
      if (this.queue.length > 0) {
        void this.drain()
      }
    }
  }

  private async drainWithApiBatches() {
    const chunkSize = EMBEDDING_API_BATCH_SIZE * PARALLEL_BATCH_REQUESTS

    while (this.queue.length > 0) {
      const chunk = this.queue.splice(0, chunkSize)
      this.publishStatus()

      const batches = splitEmbeddingApiBatches(chunk)
      await Promise.all(batches.map((batch) => this.processBatchEntryIds(batch)))
    }
  }

  private async drainLegacySingle() {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, LEGACY_QUEUE_BATCH_SIZE)
      this.publishStatus()
      await this.runWithConcurrency(batch, LEGACY_CONCURRENCY, (entryId) =>
        this.processJob(entryId),
      )
    }
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    task: (item: T) => Promise<void>,
  ) {
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async (_, index) => {
        for (let itemIndex = index; itemIndex < items.length; itemIndex += concurrency) {
          await task(items[itemIndex]!)
        }
      },
    )

    await Promise.all(workers)
  }

  private isPending(entryId: string) {
    const startedAt = this.pendingSince.get(entryId)
    if (startedAt === undefined) return false

    if (Date.now() - startedAt >= STALE_PENDING_MS) {
      this.pendingSince.delete(entryId)
      return false
    }

    return true
  }

  private markPending(entryId: string) {
    this.pendingSince.set(entryId, Date.now())
  }

  private clearPending(entryId: string) {
    this.pendingSince.delete(entryId)
  }

  private isEntryStillSubscribed(entryId: string) {
    return Boolean(getSubscriptionByEntryId(entryId))
  }

  private isEntryCancelled(entryId: string) {
    return this.cancelledActiveEntryIds.has(entryId) || !this.isEntryStillSubscribed(entryId)
  }

  private isEntryFromFeedIds(entryId: string, feedIds: Set<string>) {
    const entry = getEntry(entryId)
    return Boolean(entry?.feedId && feedIds.has(entry.feedId))
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`[embedding] Timed out after ${timeoutMs}ms: ${label}`))
        }, timeoutMs)
      }),
    ])
  }

  private finishJob(entryId: string) {
    this.activeJobs.delete(entryId)
    this.inFlightIds.delete(entryId)
    this.cancelledActiveEntryIds.delete(entryId)
    this.clearPending(entryId)
  }

  private async processBatchEntryIds(entryIds: string[]) {
    const activeEntryIds = entryIds.filter((entryId) => !this.isEntryCancelled(entryId))
    const cancelledEntryIds = entryIds.filter((entryId) => this.isEntryCancelled(entryId))

    for (const entryId of cancelledEntryIds) {
      this.finishJob(entryId)
    }
    if (activeEntryIds.length === 0) return

    const startedAt = new Date().toISOString()
    for (const entryId of activeEntryIds) {
      this.activeJobs.set(entryId, { entryId, startedAt })
    }
    this.publishStatus()

    try {
      await this.withTimeout(
        entryEmbeddingSyncService.generateEmbeddingsBatch(activeEntryIds),
        BATCH_JOB_TIMEOUT_MS,
        `${activeEntryIds.length} entries`,
      )
    } catch (error) {
      await this.retryBatchWithSplit(activeEntryIds, error)
    } finally {
      for (const entryId of activeEntryIds) {
        this.finishJob(entryId)
      }
      this.publishStatus()
    }
  }

  private async retryBatchWithSplit(entryIds: string[], error: unknown) {
    if (entryIds.length <= 1) {
      const entryId = entryIds[0]
      if (!entryId) return

      const message = error instanceof Error ? error.message : "Unknown embedding error"
      console.warn("[embedding] Failed to embed entry:", entryId, error)
      this.lastError = {
        entryId,
        message,
        at: new Date().toISOString(),
      }
      return
    }

    const mid = Math.ceil(entryIds.length / 2)
    await this.processBatchEntryIds(entryIds.slice(0, mid))
    await this.processBatchEntryIds(entryIds.slice(mid))
  }

  private async processJob(entryId: string) {
    if (this.isEntryCancelled(entryId)) {
      this.finishJob(entryId)
      this.publishStatus()
      return
    }

    const startedAt = new Date().toISOString()
    this.activeJobs.set(entryId, { entryId, startedAt })
    this.publishStatus()

    try {
      await this.withTimeout(
        entryEmbeddingSyncService.generateEmbedding({ entryId }),
        JOB_TIMEOUT_MS,
        entryId,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown embedding error"
      console.warn("[embedding] Failed to embed entry:", entryId, error)
      this.lastError = {
        entryId,
        message,
        at: new Date().toISOString(),
      }
    } finally {
      this.finishJob(entryId)
      this.publishStatus()
    }
  }
}

export const entryEmbeddingJobService = new EntryEmbeddingJobService()

export { hasEmbeddingEligibleText } from "./source-text"
