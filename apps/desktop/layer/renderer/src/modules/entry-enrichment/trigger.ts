import { LOCAL_RSS_MODE } from "@follow/shared/constants"
import { entryEnrichmentService } from "@follow/store/enrichment/service"
import type { EnrichmentPhase } from "@follow/store/enrichment/types"
import { useEntryStore } from "@follow/store/entry/store"
import { entryEmbeddingJobService } from "@follow/store/entry-embedding/job-service"
import { entryRankScoreSyncService } from "@follow/store/entry-rank-score/store"

import { getAISettings } from "~/atoms/settings/ai"
import { getActionLanguage, getGeneralSettings } from "~/atoms/settings/general"

export const getByokPhases = (): EnrichmentPhase[] => {
  const { summary, translation, autoTag, qualityScore } = getGeneralSettings()
  const phases: EnrichmentPhase[] = []

  if (summary) phases.push("summary")
  if (translation) phases.push("titleTranslation")
  if (autoTag) phases.push("tags")
  if (qualityScore) phases.push("qualityScore")

  return phases
}

const isEmbeddingEnabled = () => LOCAL_RSS_MODE && (getAISettings().embedding?.enabled ?? false)

export const triggerEntryEnrichmentFromIngest = (entryIds: string[]) => {
  if (entryIds.length === 0) return

  const byokPhases = getByokPhases()
  if (byokPhases.length > 0) {
    entryEnrichmentService.enqueueFromIngest({
      entryIds,
      actionLanguage: getActionLanguage(),
      phases: byokPhases,
      translationMode: getGeneralSettings().translationMode,
    })
  }

  if (isEmbeddingEnabled()) {
    // New ingest: embed regardless of read state (ingest rows are usually unread).
    entryEmbeddingJobService.enqueueFromIngest({ entryIds })
  }
}

/**
 * BYOK enrichment: unread only (token-sensitive).
 * Embedding: unread only in backfill — aligns with BYOK ingest policy.
 */
export const triggerEntryEnrichmentBackfill = (entryIds: string[]) => {
  if (entryIds.length === 0) return

  const entryData = useEntryStore.getState().data
  const unreadIds = entryIds.filter((id) => {
    const entry = entryData[id]
    return entry && !entry.read
  })

  const byokPhases = getByokPhases()
  if (byokPhases.length > 0 && unreadIds.length > 0) {
    // Backfill only unread entries for LLM phases. Already-read content won't benefit
    // from AI enrichment, and skipping them avoids unnecessary BYOK token usage —
    // especially after initial feed subscription where historical entries are pre-marked as read.
    entryEnrichmentService.backfillVisible({
      entryIds: unreadIds,
      actionLanguage: getActionLanguage(),
      phases: byokPhases,
      translationMode: getGeneralSettings().translationMode,
    })
  }

  if (isEmbeddingEnabled() && unreadIds.length > 0) {
    entryEmbeddingJobService.backfillVisible({ entryIds: unreadIds })
  }
}

/** Gap-fill embeddings for unread entries missing vectors. Safe to call repeatedly. */
export const triggerEntryEmbeddingLibraryBackfill = () => {
  if (!isEmbeddingEnabled()) return 0
  return entryEmbeddingJobService.enqueueAllMissing()
}

export const triggerEntryRankFromIngest = (entryIds: string[]) => {
  if (entryIds.length === 0) return

  void entryRankScoreSyncService.recomputeForEntries(entryIds, { onlyMissing: true })
}

export const triggerEntryRankBackfill = (entryIds: string[]) => {
  if (entryIds.length === 0) return

  void entryRankScoreSyncService.recomputeForEntries(entryIds, { onlyMissing: true })
}
