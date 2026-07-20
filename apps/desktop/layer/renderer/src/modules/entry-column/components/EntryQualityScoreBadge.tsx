import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@follow/components/ui/hover-card/index.js"
import { LOCAL_RSS_MODE } from "@follow/shared/constants"
import type { EntryQualityScoreRecord } from "@follow/shared/entry-quality-score"
import { getQualityScoreTier } from "@follow/shared/entry-quality-score"
import type {
  EntryRecommendationReason,
  RecommendationDiagnostic,
} from "@follow/shared/entry-rank-score"
import { useEntryQualityScore } from "@follow/store/entry-quality-score/hooks"
import { cn } from "@follow/utils/utils"
import type { ReactNode } from "react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { useLibrarySearchActive } from "~/atoms/library-search"
import { useGeneralSettingKey } from "~/atoms/settings/general"
import { useRouteParamsSelector } from "~/hooks/biz/useRouteParams"

import { useEntryRecommendationDiagnostic } from "../hooks/useEntryRecommendationDiagnostic"

const tierClassName: Record<ReturnType<typeof getQualityScoreTier>, string> = {
  high: "bg-green/15 text-green",
  medium: "bg-yellow/15 text-yellow",
  low: "bg-gray/15 text-text-secondary",
  ignore: "bg-gray/10 text-text-tertiary",
}

const DIMENSION_KEYS = [
  "information_gain",
  "depth",
  "evidence",
  "actionability",
  "originality",
  "signal_density",
] as const satisfies readonly (keyof EntryQualityScoreRecord["scores"])[]

const RECOMMENDATION_REASON_KEY_BY_CODE = {
  freshness_recent: "entry.recommendation.reason.freshness_recent",
  interest_match: "entry.recommendation.reason.interest_match",
  low_quality: "entry.recommendation.reason.low_quality",
  missing_reference_date: "entry.recommendation.reason.missing_reference_date",
  negative_interest_match: "entry.recommendation.reason.negative_interest_match",
  not_in_candidate_set: "entry.recommendation.reason.not_in_candidate_set",
  not_interested: "entry.recommendation.reason.not_interested",
  quality_pending: "entry.recommendation.reason.quality_pending",
  quality_score: "entry.recommendation.reason.quality_score",
  stale_read: "entry.recommendation.reason.stale_read",
  stale_starred: "entry.recommendation.reason.stale_starred",
  state_neutral: "entry.recommendation.reason.state_neutral",
  state_penalty: "entry.recommendation.reason.state_penalty",
  state_priority: "entry.recommendation.reason.state_priority",
  unscored_expired: "entry.recommendation.reason.unscored_expired",
} as const

const qualityScoreHoverCardStyle = {
  backgroundColor: "rgb(var(--color-materialOpaque))",
  boxShadow:
    "0 6px 20px rgba(0, 0, 0, 0.08), 0 4px 12px rgba(0, 0, 0, 0.05), 0 2px 6px rgba(0, 0, 0, 0.04)",
} as const

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <div className="text-[11px] font-semibold uppercase tracking-normal text-text-secondary">
    {children}
  </div>
)

const QualityScoreMvpDetails = ({ record }: { record: EntryQualityScoreRecord }) => {
  const { t } = useTranslation("app")

  const contentTypes = useMemo(
    () =>
      Object.entries(record.content_types)
        .filter(([, weight]) => typeof weight === "number" && weight > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3),
    [record.content_types],
  )

  return (
    <div className="flex flex-col gap-2 text-xs leading-snug text-text">
      <SectionTitle>{t("entry.quality_score.mvp.content_quality")}</SectionTitle>

      <div className="font-semibold">
        {t("entry.quality_score.mvp.title", { score: record.quality_score })}
      </div>

      <div className="text-text-secondary">
        {t("entry.quality_score.mvp.confidence", {
          value: Math.round(record.confidence * 100),
        })}
      </div>

      {record.summary ? <p>{record.summary}</p> : null}

      {contentTypes.length > 0 ? (
        <div>
          <div className="mb-1 font-medium text-text-secondary">
            {t("entry.quality_score.mvp.content_types")}
          </div>
          <ul className="space-y-0.5">
            {contentTypes.map(([type, weight]) => (
              <li key={type}>
                {type} ({Math.round(weight * 100)}%)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <div className="mb-1 font-medium text-text-secondary">
          {t("entry.quality_score.mvp.dimensions")}
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {DIMENSION_KEYS.map((key) => (
            <li key={key}>
              {key}: {record.scores[key]}/5
            </li>
          ))}
        </ul>
      </div>

      {record.positive_reasons.length > 0 ? (
        <div>
          <div className="mb-1 font-medium text-green">{t("entry.quality_score.mvp.positive")}</div>
          <ul className="list-disc space-y-0.5 pl-4">
            {record.positive_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {record.negative_reasons.length > 0 ? (
        <div>
          <div className="mb-1 font-medium text-orange">
            {t("entry.quality_score.mvp.negative")}
          </div>
          <ul className="list-disc space-y-0.5 pl-4">
            {record.negative_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

const getReasonClassName = (impact: EntryRecommendationReason["impact"]) => {
  if (impact === "positive") return "text-green"
  if (impact === "negative") return "text-orange"
  return "text-text-tertiary"
}

const formatSignedScore = (value: number) => {
  const rounded = value.toFixed(3)
  return value > 0 ? `+${rounded}` : rounded
}

const RecommendationDetails = ({ diagnostic }: { diagnostic: RecommendationDiagnostic }) => {
  const { t } = useTranslation("app")

  const labelForReason = (reason: EntryRecommendationReason): string => {
    const key =
      RECOMMENDATION_REASON_KEY_BY_CODE[
        reason.code as keyof typeof RECOMMENDATION_REASON_KEY_BY_CODE
      ]

    return key ? t(key) : reason.label
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2 text-xs leading-snug text-text">
      <SectionTitle>{t("entry.recommendation.title")}</SectionTitle>

      <div className="font-medium">
        {diagnostic.included
          ? t("entry.recommendation.included")
          : t("entry.recommendation.filtered")}
      </div>

      {diagnostic.reasons.length > 0 ? (
        <ul className="space-y-1">
          {diagnostic.reasons.map((reason) => (
            <li key={`${reason.type}-${reason.code}`} className="flex gap-2">
              <i
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full bg-current",
                  getReasonClassName(reason.impact),
                )}
              />
              <span>{labelForReason(reason)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="text-[11px] text-text-tertiary">
        {t("entry.recommendation.diagnostics", {
          finalScore: diagnostic.finalScore === null ? "—" : diagnostic.finalScore.toFixed(3),
          stateScore: formatSignedScore(diagnostic.stateScore),
        })}
      </div>
    </div>
  )
}

export const EntryQualityScoreBadge = ({ entryId }: { entryId: string }) => {
  const qualityScoreEnabled = useGeneralSettingKey("qualityScore")
  const record = useEntryQualityScore(entryId)
  const librarySearchActive = useLibrarySearchActive()
  const smartFeed = useRouteParamsSelector((route) => route.smartFeed)
  const showRecommendationDetails = smartFeed === "recommended" && !librarySearchActive
  const recommendationDiagnostic = useEntryRecommendationDiagnostic(
    entryId,
    Boolean(qualityScoreEnabled && record && showRecommendationDetails),
  )

  if (!LOCAL_RSS_MODE || !qualityScoreEnabled || !record) return null

  const tier = getQualityScoreTier(record.quality_score)

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            "inline-flex min-w-[2rem] shrink-0 cursor-default items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            tierClassName[tier],
          )}
        >
          {record.quality_score}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={12}
        collisionPadding={16}
        style={qualityScoreHoverCardStyle}
        className={cn(
          "w-80 rounded-xl border border-border p-3",
          "!bg-material-opaque !backdrop-blur-none",
        )}
      >
        <QualityScoreMvpDetails record={record} />
        {recommendationDiagnostic ? (
          <RecommendationDetails diagnostic={recommendationDiagnostic} />
        ) : null}
      </HoverCardContent>
    </HoverCard>
  )
}
