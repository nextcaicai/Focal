import type { BehaviorEventType } from "@follow/shared/behavior-events"
import { useCallback } from "react"

import type { BehaviorEvent } from "./store"
import { useBehaviorEventStore } from "./store"

const toCreatedAtTime = (createdAt: string) => {
  const time = new Date(createdAt).getTime()
  return Number.isFinite(time) ? time : 0
}

export const getEntryIdsByBehaviorEventType = (
  events: readonly BehaviorEvent[],
  eventType: BehaviorEventType,
) => {
  const latestEventByEntryId = new Map<string, BehaviorEvent>()

  for (const event of events) {
    if (event.eventType !== eventType) continue

    const previous = latestEventByEntryId.get(event.entryId)
    if (!previous || toCreatedAtTime(event.createdAt) > toCreatedAtTime(previous.createdAt)) {
      latestEventByEntryId.set(event.entryId, event)
    }
  }

  return Array.from(latestEventByEntryId.values())
    .sort((a, b) => toCreatedAtTime(b.createdAt) - toCreatedAtTime(a.createdAt))
    .map((event) => event.entryId)
}

export const useEntryIdsByBehaviorEventType = (eventType: BehaviorEventType) => {
  return useBehaviorEventStore(
    useCallback((state) => getEntryIdsByBehaviorEventType(state.events, eventType), [eventType]),
  )
}

export const useReadLaterEntryList = () => useEntryIdsByBehaviorEventType("read_later")
