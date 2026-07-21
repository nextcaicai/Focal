import { FeedViewType } from "@follow/constants"
import { getSubscriptionByFeedId } from "@follow/store/subscription/getter"
import type { ExtractResponseData, SubscriptionImportResponse } from "@follow-app/client-sdk"

import { previewLocalRssFeed, upsertLocalRssSubscription } from "~/modules/local-rss/service"

import type { ParsedFeedItem } from "./types"

export type ParsedOpmlData = {
  subscriptions: ParsedFeedItem[]
  remaining: number
}

export type OpmlImportResult = ExtractResponseData<SubscriptionImportResponse>

export class InvalidOpmlError extends Error {
  constructor() {
    super("INVALID_OPML")
    this.name = "InvalidOpmlError"
  }
}

const getAttribute = (element: Element, names: string[]) => {
  const normalizedNames = new Set(names.map((name) => name.toLowerCase()))
  const attribute = Array.from(element.attributes).find((item) =>
    normalizedNames.has(item.name.toLowerCase()),
  )
  return attribute?.value.trim() || null
}

const getOutlineTitle = (outline: Element) => getAttribute(outline, ["title", "text"])

const getChildOutlines = (element: Element) =>
  Array.from(element.children).filter((child) => child.localName.toLowerCase() === "outline")

export const parseLocalOpml = (content: string): ParsedOpmlData => {
  const document = new DOMParser().parseFromString(content, "text/xml")
  const root = document.documentElement

  if (!root || root.localName.toLowerCase() !== "opml" || document.querySelector("parsererror")) {
    throw new InvalidOpmlError()
  }

  const body = Array.from(root.children).find((child) => child.localName.toLowerCase() === "body")
  if (!body) {
    throw new InvalidOpmlError()
  }

  const subscriptions: ParsedFeedItem[] = []
  const seenUrls = new Set<string>()

  const visitOutline = (outline: Element, parentCategory: string | null) => {
    const url = getAttribute(outline, ["xmlUrl", "url"])
    const title = getOutlineTitle(outline)

    if (url) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url)
        subscriptions.push({
          url,
          title,
          category: getAttribute(outline, ["category"]) || parentCategory,
          view: FeedViewType.Articles,
        })
      }
    } else {
      const category = title || parentCategory
      for (const child of getChildOutlines(outline)) {
        visitOutline(child, category)
      }
    }
  }

  for (const outline of getChildOutlines(body)) {
    visitOutline(outline, null)
  }

  if (subscriptions.length === 0) {
    throw new InvalidOpmlError()
  }

  return {
    subscriptions,
    remaining: subscriptions.length,
  }
}

export const importLocalOpmlSubscriptions = async (
  selectedItems: ParsedFeedItem[],
): Promise<OpmlImportResult> => {
  const result: OpmlImportResult = {
    successfulItems: [],
    conflictItems: [],
    parsedErrorItems: [],
  }

  for (const item of selectedItems) {
    try {
      const { feed } = await previewLocalRssFeed({ url: item.url })

      if (getSubscriptionByFeedId(feed.id)) {
        result.conflictItems.push({
          id: feed.id,
          url: item.url,
          title: item.title,
        })
        continue
      }

      await upsertLocalRssSubscription({
        feed: { ...feed, type: "feed" },
        subscription: {
          url: item.url,
          view: item.view,
          category: item.category,
          isPrivate: false,
          hideFromTimeline: false,
          title: item.title,
          feedId: feed.id,
          listId: undefined,
        },
      })

      result.successfulItems.push({
        id: feed.id,
        url: item.url,
        title: item.title,
      })
    } catch {
      result.parsedErrorItems.push({
        url: item.url,
        title: item.title,
      })
    }
  }

  return result
}
