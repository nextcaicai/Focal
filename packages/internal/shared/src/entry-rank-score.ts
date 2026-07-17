import type { EntryQualityScoreRecord } from "./entry-quality-score"
import type { InterestCluster } from "./interest-profile"
import { computeInterestComponents } from "./interest-profile"

export type EntryRankContext = "cold_start" | "interest"

export type EntryRankReasonType =
  | "quality"
  | "freshness"
  | "state"
  | "interest"
  | "negative_interest"
  | "fallback"

export type RecommendedFilterReason =
  | "not_in_candidate_set"
  | "not_interested"
  | "stale_read"
  | "stale_starred"
  | "low_quality"
  | "unscored_expired"
  | "missing_reference_date"

export interface EntryRankReason {
  type: EntryRankReasonType
  label: string
  impact: "positive" | "negative" | "neutral"
}

export type EntryRecommendationReasonType = EntryRankReasonType | "filter"

export interface EntryRecommendationReason {
  type: EntryRecommendationReasonType
  code: string
  label: string
  impact: "positive" | "negative" | "neutral"
  value?: number
}

export interface EntryRankComponents {
  quality_component: number
  freshness_component: number
  interest_component: number
  negative_interest_penalty: number
  base_score: number
}

export interface EntryRankExplanation {
  recommendation_reasons: EntryRecommendationReason[]
  filter_reason: RecommendedFilterReason | null
  final_score: number | null
  state_score: number | null
}

export interface EntryRankRecord {
  context: EntryRankContext
  components: EntryRankComponents
  reasons: EntryRankReason[]
  explanation?: EntryRankExplanation
  computed_at: string
}

export interface RankComposerInput {
  publishedAt: Date
  insertedAt?: Date | null
  qualityRecord: EntryQualityScoreRecord | null
  now?: Date
}

export interface RankInterestComposerInput extends RankComposerInput {
  embedding?: number[] | null
  clusters?: InterestCluster[]
}

export interface EntryStateRankInput {
  read: boolean
  starred: boolean
}

export type EntryTimelineSortMode = "latest" | "recommended"

export const RANK_QUALITY_MAX = 0.35
export const RANK_FRESHNESS_MAX = 0.35
export const RANK_FRESHNESS_HALF_LIFE_HOURS = 36

export const RANK_STATE_UNREAD = 0.06
export const RANK_STATE_STARRED = 0.04
export const RANK_STATE_READ = -0.08

export const RECOMMENDED_MIN_QUALITY_SCORE = 50
export const RECOMMENDED_UNSCORED_GRACE_HOURS = 24

const MS_PER_HOUR = 60 * 60 * 1000

export function clampRankScore(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function getEntryStateScore({ read, starred }: EntryStateRankInput): number {
  if (starred) return RANK_STATE_STARRED
  if (!read) return RANK_STATE_UNREAD
  return RANK_STATE_READ
}

export function getEntryFinalRankScore(record: EntryRankRecord, stateScore: number): number {
  return clampRankScore(record.components.base_score + stateScore)
}

function getStartOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isBeforeLocalDay(date: Date, now: Date): boolean {
  return date.getTime() < getStartOfLocalDay(now).getTime()
}

function computeFreshnessComponent(referenceDate: Date, now: Date): number {
  const ageHours = Math.max(0, (now.getTime() - referenceDate.getTime()) / MS_PER_HOUR)
  return Math.exp(-ageHours / RANK_FRESHNESS_HALF_LIFE_HOURS) * RANK_FRESHNESS_MAX
}

function computeQualityComponent(qualityRecord: EntryQualityScoreRecord | null): number {
  if (!qualityRecord) return 0

  const normalized = qualityRecord.quality_score / 100
  const confidence = clampRankScore(qualityRecord.confidence)
  return normalized * confidence * RANK_QUALITY_MAX
}

function buildReasons(
  qualityRecord: EntryQualityScoreRecord | null,
  qualityComponent: number,
  freshnessComponent: number,
): EntryRankReason[] {
  const reasons: EntryRankReason[] = []

  if (qualityRecord && qualityComponent > 0) {
    reasons.push({
      type: "quality",
      label: `Quality score ${qualityRecord.quality_score}`,
      impact: "positive",
    })
  } else {
    reasons.push({
      type: "fallback",
      label: "Quality score pending",
      impact: "neutral",
    })
  }

  if (freshnessComponent > 0) {
    reasons.push({
      type: "freshness",
      label: "Recency boost",
      impact: "positive",
    })
  }

  return reasons.slice(0, 5)
}

function buildRecommendationReasons(
  qualityRecord: EntryQualityScoreRecord | null,
  qualityComponent: number,
  freshnessComponent: number,
): EntryRecommendationReason[] {
  const reasons: EntryRecommendationReason[] = []

  if (qualityRecord && qualityComponent > 0) {
    reasons.push({
      type: "quality",
      code: "quality_score",
      label: `Content quality score ${qualityRecord.quality_score}`,
      impact: "positive",
      value: qualityRecord.quality_score,
    })
  } else {
    reasons.push({
      type: "fallback",
      code: "quality_pending",
      label: "Content quality score pending",
      impact: "neutral",
    })
  }

  if (freshnessComponent > 0) {
    reasons.push({
      type: "freshness",
      code: "freshness_recent",
      label: "Recently published",
      impact: "positive",
      value: freshnessComponent,
    })
  }

  return reasons.slice(0, 5)
}

function buildInterestReasons(
  interestComponent: number,
  negativePenalty: number,
): EntryRankReason[] {
  const reasons: EntryRankReason[] = []

  if (interestComponent > 0) {
    reasons.push({
      type: "interest",
      label: "Interest match",
      impact: "positive",
    })
  }

  if (negativePenalty > 0) {
    reasons.push({
      type: "negative_interest",
      label: "Negative interest match",
      impact: "negative",
    })
  }

  return reasons
}

function buildInterestRecommendationReasons(
  interestComponent: number,
  negativePenalty: number,
): EntryRecommendationReason[] {
  const reasons: EntryRecommendationReason[] = []

  if (interestComponent > 0) {
    reasons.push({
      type: "interest",
      code: "interest_match",
      label: "Matches your reading interests",
      impact: "positive",
      value: interestComponent,
    })
  }

  if (negativePenalty > 0) {
    reasons.push({
      type: "negative_interest",
      code: "negative_interest_match",
      label: "Similar to content marked not interesting",
      impact: "negative",
      value: negativePenalty,
    })
  }

  return reasons
}

export function composeRankBase(input: RankComposerInput): EntryRankRecord {
  const now = input.now ?? new Date()
  const referenceDate = input.publishedAt ?? input.insertedAt ?? now

  const qualityComponent = computeQualityComponent(input.qualityRecord)
  const freshnessComponent = computeFreshnessComponent(referenceDate, now)
  const baseScore = clampRankScore(qualityComponent + freshnessComponent)

  return {
    context: "cold_start",
    components: {
      quality_component: qualityComponent,
      freshness_component: freshnessComponent,
      interest_component: 0,
      negative_interest_penalty: 0,
      base_score: baseScore,
    },
    reasons: buildReasons(input.qualityRecord, qualityComponent, freshnessComponent),
    explanation: {
      recommendation_reasons: buildRecommendationReasons(
        input.qualityRecord,
        qualityComponent,
        freshnessComponent,
      ),
      filter_reason: null,
      final_score: null,
      state_score: null,
    },
    computed_at: now.toISOString(),
  }
}

export function composeRankWithInterest(input: RankInterestComposerInput): EntryRankRecord {
  const base = composeRankBase(input)
  const { interest_component, negative_interest_penalty } = computeInterestComponents(
    input.embedding,
    input.clusters ?? [],
  )

  const baseScore = clampRankScore(
    base.components.quality_component +
      base.components.freshness_component +
      interest_component -
      negative_interest_penalty,
  )

  const hasInterestSignal =
    Boolean(input.embedding && input.embedding.length > 0) &&
    (interest_component > 0 || negative_interest_penalty > 0 || (input.clusters?.length ?? 0) > 0)

  return {
    context: hasInterestSignal ? "interest" : base.context,
    components: {
      ...base.components,
      interest_component,
      negative_interest_penalty,
      base_score: baseScore,
    },
    reasons: [
      ...base.reasons,
      ...buildInterestReasons(interest_component, negative_interest_penalty),
    ].slice(0, 5),
    explanation: {
      recommendation_reasons: [
        ...(base.explanation?.recommendation_reasons ?? []),
        ...buildInterestRecommendationReasons(interest_component, negative_interest_penalty),
      ].slice(0, 5),
      filter_reason: null,
      final_score: null,
      state_score: null,
    },
    computed_at: base.computed_at,
  }
}

export interface SortEntryIdsByRankInput {
  entryIds: string[]
  getBaseRank: (entryId: string) => EntryRankRecord | undefined
  getPublishedAt: (entryId: string) => Date | undefined
  getEntryState: (entryId: string) => EntryStateRankInput | undefined
}

export function sortEntryIdsByRank({
  entryIds,
  getBaseRank,
  getPublishedAt,
  getEntryState,
}: SortEntryIdsByRankInput): string[] {
  return [...entryIds].sort((leftId, rightId) => {
    const leftRank = getBaseRank(leftId)
    const rightRank = getBaseRank(rightId)

    const leftState = getEntryState(leftId) ?? { read: false, starred: false }
    const rightState = getEntryState(rightId) ?? { read: false, starred: false }

    const leftFinal = leftRank
      ? getEntryFinalRankScore(leftRank, getEntryStateScore(leftState))
      : getEntryStateScore(leftState)
    const rightFinal = rightRank
      ? getEntryFinalRankScore(rightRank, getEntryStateScore(rightState))
      : getEntryStateScore(rightState)

    if (rightFinal !== leftFinal) {
      return rightFinal - leftFinal
    }

    const leftPublishedAt = getPublishedAt(leftId)?.getTime() ?? 0
    const rightPublishedAt = getPublishedAt(rightId)?.getTime() ?? 0
    if (rightPublishedAt !== leftPublishedAt) {
      return rightPublishedAt - leftPublishedAt
    }

    return leftId.localeCompare(rightId)
  })
}

export interface RecommendedEntryCandidateInput {
  entryIds: string[]
  now?: Date
  getPublishedAt: (entryId: string) => Date | undefined
  getInsertedAt?: (entryId: string) => Date | undefined
  getQualityRecord: (entryId: string) => EntryQualityScoreRecord | null | undefined
  getEntryState: (entryId: string) => EntryStateRankInput | undefined
  getReadCompletedAt?: (entryId: string) => Date | undefined
  getStarredAt?: (entryId: string) => Date | undefined
  getNotInterestedAt?: (entryId: string) => Date | undefined
}

export function getRecommendedEntryFilterReason({
  entryId,
  now = new Date(),
  getPublishedAt,
  getInsertedAt,
  getQualityRecord,
  getEntryState,
  getReadCompletedAt,
  getStarredAt,
  getNotInterestedAt,
}: Omit<RecommendedEntryCandidateInput, "entryIds"> & {
  entryId: string
}): RecommendedFilterReason | null {
  if (getNotInterestedAt?.(entryId)) return "not_interested"

  const state = getEntryState(entryId) ?? { read: false, starred: false }
  const readCompletedAt = getReadCompletedAt?.(entryId)
  if (state.read && readCompletedAt && isBeforeLocalDay(readCompletedAt, now)) {
    return "stale_read"
  }

  const starredAt = getStarredAt?.(entryId)
  if (state.starred && starredAt && isBeforeLocalDay(starredAt, now)) {
    return "stale_starred"
  }

  const qualityRecord = getQualityRecord(entryId)
  if (qualityRecord) {
    return qualityRecord.quality_score >= RECOMMENDED_MIN_QUALITY_SCORE ? null : "low_quality"
  }

  const referenceDate = getPublishedAt(entryId) ?? getInsertedAt?.(entryId)
  if (!referenceDate) return "missing_reference_date"

  const ageHours = Math.max(0, (now.getTime() - referenceDate.getTime()) / MS_PER_HOUR)
  return ageHours <= RECOMMENDED_UNSCORED_GRACE_HOURS ? null : "unscored_expired"
}

export function isRecommendedEntryCandidate(
  input: Omit<RecommendedEntryCandidateInput, "entryIds"> & { entryId: string },
): boolean {
  return getRecommendedEntryFilterReason(input) === null
}

export function filterRecommendedEntryIds({
  entryIds,
  ...input
}: RecommendedEntryCandidateInput): string[] {
  return entryIds.filter((entryId) => isRecommendedEntryCandidate({ ...input, entryId }))
}

export interface RecommendationDiagnosticInput extends RecommendedEntryCandidateInput {
  entryId: string
  getBaseRank: (entryId: string) => EntryRankRecord | undefined
}

export interface RecommendationDiagnostic {
  entryId: string
  candidate: boolean
  included: boolean
  filterReason: RecommendedFilterReason | null
  rank: EntryRankRecord | null
  stateScore: number
  finalScore: number | null
  reasons: EntryRecommendationReason[]
}

function stateRecommendationReason(stateScore: number): EntryRecommendationReason {
  if (stateScore > 0) {
    return {
      type: "state",
      code: "state_priority",
      label: "Entry state raises recommendation priority",
      impact: "positive",
      value: stateScore,
    }
  }

  if (stateScore < 0) {
    return {
      type: "state",
      code: "state_penalty",
      label: "Entry state lowers recommendation priority",
      impact: "negative",
      value: stateScore,
    }
  }

  return {
    type: "state",
    code: "state_neutral",
    label: "Entry state does not change recommendation priority",
    impact: "neutral",
    value: stateScore,
  }
}

function filterRecommendationReason(reason: RecommendedFilterReason): EntryRecommendationReason {
  return {
    type: "filter",
    code: reason,
    label: `Filtered from Recommended: ${reason}`,
    impact: "negative",
  }
}

function legacyRecommendationReasons(record: EntryRankRecord): EntryRecommendationReason[] {
  return record.reasons.map((reason) => ({
    type: reason.type,
    code: reason.type,
    label: reason.label,
    impact: reason.impact,
  }))
}

export function explainRecommendedEntryCandidate({
  entryId,
  entryIds,
  getBaseRank,
  ...input
}: RecommendationDiagnosticInput): RecommendationDiagnostic {
  const candidate = entryIds.includes(entryId)
  const filterReason = candidate
    ? getRecommendedEntryFilterReason({ ...input, entryId })
    : "not_in_candidate_set"
  const included = candidate && filterReason === null
  const rank = getBaseRank(entryId) ?? null
  const state = input.getEntryState(entryId) ?? { read: false, starred: false }
  const stateScore = getEntryStateScore(state)
  const finalScore = included
    ? rank
      ? getEntryFinalRankScore(rank, stateScore)
      : stateScore
    : null
  const baseReasons =
    rank?.explanation?.recommendation_reasons ?? (rank ? legacyRecommendationReasons(rank) : [])
  const reasons = filterReason
    ? [...baseReasons, filterRecommendationReason(filterReason)]
    : [...baseReasons, stateRecommendationReason(stateScore)]

  return {
    entryId,
    candidate,
    included,
    filterReason,
    rank,
    stateScore,
    finalScore,
    reasons: reasons.slice(0, 6),
  }
}
