import { LOCAL_RSS_MODE } from "@follow/shared/constants"
import { useEntryQualityScore } from "@follow/store/entry-quality-score/hooks"
import { useSummary } from "@follow/store/summary/hooks"

import { useActionLanguage, useGeneralSettingKey } from "~/atoms/settings/general"

const normalizeSummaryText = (summary: string | null | undefined) => {
  if (!summary) return ""

  return summary
    .replaceAll(/```[\s\S]*?```/g, " ")
    .replaceAll(/`([^`]+)`/g, "$1")
    .replaceAll(/\*\*([^*]+)\*\*/g, "$1")
    .replaceAll(/\*([^*]+)\*/g, "$1")
    .replaceAll(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replaceAll(/^\s{0,3}#{1,6}\s+/gm, "")
    .replaceAll(/^\s*[-*+]\s+/gm, "")
    .replaceAll(/\s+/g, " ")
    .trim()
}

export const getEntrySummaryDescription = ({
  fallback,
  qualityScoreSummary,
  readabilitySummary,
  summary,
}: {
  fallback?: string | null
  qualityScoreSummary?: string | null
  readabilitySummary?: string | null
  summary?: string | null
}) => {
  const qualityScoreSummaryText = normalizeSummaryText(qualityScoreSummary)
  const summaryText = normalizeSummaryText(readabilitySummary || summary)
  const generatedDescription = qualityScoreSummaryText || summaryText

  return {
    description: generatedDescription || fallback || "",
    isSummary: !!generatedDescription,
  }
}

export const useEntrySummaryDescription = (entryId: string, fallback?: string | null) => {
  const actionLanguage = useActionLanguage()
  const qualityScoreEnabled = useGeneralSettingKey("qualityScore")
  const qualityScore = useEntryQualityScore(entryId)
  const summary = useSummary(entryId, actionLanguage)

  return getEntrySummaryDescription({
    fallback,
    qualityScoreSummary: LOCAL_RSS_MODE && qualityScoreEnabled ? qualityScore?.summary : null,
    readabilitySummary: summary?.readabilitySummary,
    summary: summary?.summary,
  })
}
