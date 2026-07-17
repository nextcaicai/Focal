export type BehaviorEventType =
  | "open"
  | "mark_read"
  | "read_progress"
  | "read_complete"
  | "favorite"
  | "read_later"
  | "hide"
  | "not_interested"
  | "quick_bounce"

export interface BehaviorEventMetadata {
  progress?: number
  durationMs?: number
  source?: "list" | "reader" | "search" | "command"
  reason?: string
}

export const BEHAVIOR_EVENT_TYPES = [
  "open",
  "mark_read",
  "read_progress",
  "read_complete",
  "favorite",
  "read_later",
  "hide",
  "not_interested",
  "quick_bounce",
] as const satisfies readonly BehaviorEventType[]

export const BEHAVIOR_EVENT_WEIGHTS: Record<BehaviorEventType, number> = {
  open: 0,
  mark_read: 0,
  read_progress: 1.2,
  read_complete: 4,
  favorite: 6,
  read_later: 3,
  hide: -3.5,
  not_interested: -6,
  quick_bounce: -0.5,
}

export function getBehaviorEventPolarity(eventType: BehaviorEventType): "positive" | "negative" {
  return BEHAVIOR_EVENT_WEIGHTS[eventType] >= 0 ? "positive" : "negative"
}

export function isBehaviorEventProfileSignal(eventType: BehaviorEventType): boolean {
  return BEHAVIOR_EVENT_WEIGHTS[eventType] !== 0
}
