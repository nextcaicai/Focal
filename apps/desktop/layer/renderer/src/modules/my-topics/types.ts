import type { EntryAiTagLabel } from "@follow/shared/entry-ai-tags"

/**
 * A topic is a content selector. Supports AI tag buckets and keyword queries.
 * Keyword topics use title match + semantic similarity when embeddings exist
 * (Phase 2). Dedicated semantic / manual selectors remain deferred.
 */
export type TopicSelector =
  | { type: "aiTag"; label: EntryAiTagLabel }
  | { type: "keyword"; query: string }

export type MyTopic = {
  id: string
  name: string
  selector: TopicSelector
  pinned: boolean
  pinnedAt?: number
  createdAt: number
  /** Drives the active / dormant lifecycle. */
  lastOpenedAt: number
}

export type MyTopicStatus = "active" | "dormant"

export type SidebarTopic = MyTopic & { status: MyTopicStatus }
