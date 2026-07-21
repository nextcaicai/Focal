import { clusterEntries } from "../entry-embedding/cluster"
import { cosineWithUnitQuery, l2Normalize } from "../entry-embedding/semantic-search"

export const STORYLINE_WINDOW_HOURS = 72
export const STORYLINE_MAX_RECENT_CANDIDATES = 500
export const STORYLINE_MAX_HISTORY_CANDIDATES = 5000

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_CLUSTER_TAU = 0.82
const DEFAULT_HISTORY_TAU = 0.78
const DEFAULT_MIN_DISTINCT_SOURCES = 2
const DEFAULT_MAX_HISTORY_ITEMS = 8

export type StorylineBuildEntry = {
  entryId: string
  title: string
  description?: string | null
  publishedAt: number
  feedId?: string | null
  vector?: number[] | null
}

export type StorylineHistoryMatch = {
  entryId: string
  similarity: number
  sharedTermCount: number
}

export type Storyline = {
  id: string
  title: string
  summary: string
  latestPublishedAt: number
  currentEntryIds: string[]
  history: StorylineHistoryMatch[]
  distinctSourceCount: number
}

export type StorylineBuildResult = {
  storylines: Storyline[]
  recentEntryCount: number
  embeddedRecentEntryCount: number
  analyzedRecentEntryCount: number
  windowStartedAt: number
}

export type StorylineBuildOptions = {
  now?: number
  windowHours?: number
  clusterTau?: number
  historyTau?: number
  minDistinctSources?: number
  maxRecentCandidates?: number
  maxHistoryItems?: number
  maxHistoryCandidates?: number
  recentEntryCountTotal?: number
  embeddedRecentEntryCountTotal?: number
}

const normalizeWhitespace = (value: string) => value.replaceAll(/\s+/g, " ").trim()

const toPlainText = (value?: string | null) => {
  if (!value) return ""
  return normalizeWhitespace(value.replaceAll(/<[^>]*>/g, " "))
}

const summarize = (entry: StorylineBuildEntry) => {
  const value = toPlainText(entry.description)
  if (!value) return entry.title
  return value.length > 240 ? `${value.slice(0, 237).trimEnd()}...` : value
}

const extractTerms = (value: string): Set<string> => {
  const normalized = value.toLocaleLowerCase()
  const terms = new Set<string>()

  for (const match of normalized.matchAll(/[a-z0-9][a-z0-9.+-]{2,}/g)) {
    const term = match[0]
    if (term === "the" || term === "and" || term === "with" || term === "from") continue
    terms.add(term)
  }

  for (const match of normalized.matchAll(/\p{Script=Han}{2,}/gu)) {
    const group = match[0]
    for (let index = 0; index < group.length - 1; index++) {
      terms.add(group.slice(index, index + 2))
    }
  }

  return terms
}

const countSharedTerms = (left: Set<string>, right: Set<string>) => {
  let count = 0
  const [small, large] = left.size <= right.size ? [left, right] : [right, left]
  for (const term of small) {
    if (large.has(term)) count += 1
  }
  return count
}

const buildCentroid = (entries: StorylineBuildEntry[]): number[] | null => {
  const valid = entries
    .map((entry) => (entry.vector?.length ? l2Normalize(entry.vector) : null))
    .filter((vector): vector is number[] => !!vector)
  const dimension = valid[0]?.length ?? 0
  if (dimension === 0 || valid.some((vector) => vector.length !== dimension)) return null

  const centroid = Array.from<number>({ length: dimension }).fill(0)
  for (const vector of valid) {
    for (let index = 0; index < dimension; index++) {
      centroid[index]! += vector[index]!
    }
  }
  return l2Normalize(centroid)
}

const findRepresentative = (entries: StorylineBuildEntry[], centroid: number[]) => {
  let representative = entries[0]!
  let bestSimilarity = -Infinity
  for (const entry of entries) {
    if (!entry.vector?.length) continue
    const similarity = cosineWithUnitQuery(centroid, entry.vector)
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      representative = entry
    }
  }
  return representative
}

export const buildStorylines = (
  entries: StorylineBuildEntry[],
  options: StorylineBuildOptions = {},
): StorylineBuildResult => {
  const now = options.now ?? Date.now()
  const windowHours = options.windowHours ?? STORYLINE_WINDOW_HOURS
  const windowStartedAt = now - windowHours * HOUR_MS
  const clusterTau = options.clusterTau ?? DEFAULT_CLUSTER_TAU
  const historyTau = options.historyTau ?? DEFAULT_HISTORY_TAU
  const minDistinctSources = options.minDistinctSources ?? DEFAULT_MIN_DISTINCT_SOURCES
  const maxRecentCandidates = options.maxRecentCandidates ?? STORYLINE_MAX_RECENT_CANDIDATES
  const maxHistoryItems = options.maxHistoryItems ?? DEFAULT_MAX_HISTORY_ITEMS
  const maxHistoryCandidates = options.maxHistoryCandidates ?? STORYLINE_MAX_HISTORY_CANDIDATES

  const recentEntries = entries.filter(
    (entry) => entry.publishedAt >= windowStartedAt && entry.publishedAt <= now,
  )
  const allEmbeddedRecentEntries = recentEntries.filter((entry) => entry.vector?.length)
  const embeddedRecentEntries = allEmbeddedRecentEntries
    .sort((left, right) => right.publishedAt - left.publishedAt)
    .slice(0, maxRecentCandidates)
  const recentById = new Map(embeddedRecentEntries.map((entry) => [entry.entryId, entry]))

  const { clusters } = clusterEntries(
    embeddedRecentEntries.map((entry) => ({
      entryId: entry.entryId,
      vector: entry.vector!,
      publishedAt: entry.publishedAt,
      feedId: entry.feedId,
      title: entry.title,
    })),
    { tau: clusterTau, minSize: 2 },
  )

  const historyCandidates = entries
    .filter((entry) => entry.publishedAt < windowStartedAt && entry.vector?.length)
    .sort((left, right) => right.publishedAt - left.publishedAt)
    .slice(0, maxHistoryCandidates)
  const entryById = new Map(entries.map((entry) => [entry.entryId, entry]))

  const storylines: Storyline[] = []

  for (const cluster of clusters) {
    if (cluster.sourceFeedIds.length < minDistinctSources) continue

    const members = cluster.entryIds
      .map((entryId) => recentById.get(entryId))
      .filter((entry): entry is StorylineBuildEntry => !!entry)
    const centroid = buildCentroid(members)
    if (!centroid) continue

    const representative = findRepresentative(members, centroid)
    const currentTerms = new Set<string>()
    for (const member of members) {
      for (const term of extractTerms(member.title)) currentTerms.add(term)
    }

    const history: StorylineHistoryMatch[] = []
    for (const candidate of historyCandidates) {
      if (!candidate.vector || candidate.vector.length !== centroid.length) continue
      const similarity = cosineWithUnitQuery(centroid, candidate.vector)
      if (similarity < historyTau) continue

      const sharedTermCount = countSharedTerms(currentTerms, extractTerms(candidate.title))
      if (sharedTermCount === 0) continue

      history.push({
        entryId: candidate.entryId,
        similarity,
        sharedTermCount,
      })
    }

    history.sort(
      (left, right) =>
        right.similarity - left.similarity ||
        (entryById.get(right.entryId)?.publishedAt ?? 0) -
          (entryById.get(left.entryId)?.publishedAt ?? 0) ||
        left.entryId.localeCompare(right.entryId),
    )

    const currentEntryIds = [...cluster.entryIds].sort(
      (left, right) =>
        (recentById.get(right)?.publishedAt ?? 0) - (recentById.get(left)?.publishedAt ?? 0) ||
        left.localeCompare(right),
    )

    const selectedHistory = history
      .slice(0, maxHistoryItems)
      .sort(
        (left, right) =>
          (entryById.get(left.entryId)?.publishedAt ?? 0) -
            (entryById.get(right.entryId)?.publishedAt ?? 0) ||
          left.entryId.localeCompare(right.entryId),
      )

    storylines.push({
      id: `storyline-${representative.entryId}`,
      title: representative.title,
      summary: summarize(representative),
      latestPublishedAt: cluster.latestPublishedAt,
      currentEntryIds,
      history: selectedHistory,
      distinctSourceCount: cluster.sourceFeedIds.length,
    })
  }

  storylines.sort(
    (left, right) =>
      right.latestPublishedAt - left.latestPublishedAt || left.id.localeCompare(right.id),
  )

  return {
    storylines,
    recentEntryCount: options.recentEntryCountTotal ?? recentEntries.length,
    embeddedRecentEntryCount:
      options.embeddedRecentEntryCountTotal ?? allEmbeddedRecentEntries.length,
    analyzedRecentEntryCount: embeddedRecentEntries.length,
    windowStartedAt,
  }
}
