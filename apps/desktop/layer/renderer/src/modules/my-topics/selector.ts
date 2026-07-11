import {
  entryMatchesSemanticQuery,
  SEMANTIC_TOPIC_MIN_SCORE,
} from "@follow/store/entry-embedding/semantic-search"

import type { MyTopic, MyTopicStatus, TopicSelector } from "./types"

export type MatchableEntry = { title?: string | null }
export type MatchableTag = { label: string }

export type MatchEntryBySelectorOptions = {
  /**
   * Precomputed query↔entry cosine scores for the keyword query (Phase 2).
   * When present, keyword topics match title substring OR semantic similarity.
   */
  semanticScores?: Map<string, number> | null
  entryId?: string
  semanticMinScore?: number
}

/**
 * Pure predicate: does an entry belong to a topic selector?
 * - aiTag: the entry carries the matching AI tag
 * - keyword: title substring (always) + optional semantic similarity when
 *   `semanticScores` is provided (Phase 2 upgrade)
 */
export const matchEntryBySelector = (
  selector: TopicSelector,
  entry: MatchableEntry,
  tags?: MatchableTag[],
  options?: MatchEntryBySelectorOptions,
): boolean => {
  switch (selector.type) {
    case "aiTag": {
      return tags?.some((tag) => tag.label === selector.label) ?? false
    }
    case "keyword": {
      const query = selector.query.trim().toLowerCase()
      if (!query) return false
      if ((entry.title ?? "").toLowerCase().includes(query)) return true

      if (options?.entryId && options.semanticScores) {
        return entryMatchesSemanticQuery(
          options.entryId,
          options.semanticScores,
          options.semanticMinScore ?? SEMANTIC_TOPIC_MIN_SCORE,
        )
      }
      return false
    }
    default: {
      return false
    }
  }
}

export const getTopicStatus = (
  topic: MyTopic,
  now: number,
  activeWindowMs: number,
): MyTopicStatus =>
  topic.pinned || now - topic.lastOpenedAt <= activeWindowMs ? "active" : "dormant"

/** Two selectors are considered the same followed topic. */
export const isSameSelector = (a: TopicSelector, b: TopicSelector): boolean => {
  if (a.type !== b.type) return false
  if (a.type === "aiTag" && b.type === "aiTag") return a.label === b.label
  if (a.type === "keyword" && b.type === "keyword") {
    return a.query.trim().toLowerCase() === b.query.trim().toLowerCase()
  }
  return false
}
