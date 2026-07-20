import type { BehaviorEventType } from "@follow/shared/behavior-events"

interface EntryBehaviorEvent {
  entryId: string
  eventType: BehaviorEventType
}

export const hasEntryBehaviorEvent = (
  events: readonly EntryBehaviorEvent[],
  entryId: string,
  eventType: BehaviorEventType,
) => events.some((event) => event.entryId === entryId && event.eventType === eventType)

export const hasNotInterestedBehaviorEvent = (
  events: readonly EntryBehaviorEvent[],
  entryId: string,
) => hasEntryBehaviorEvent(events, entryId, "not_interested")

export const hasReadLaterBehaviorEvent = (events: readonly EntryBehaviorEvent[], entryId: string) =>
  hasEntryBehaviorEvent(events, entryId, "read_later")
