// @vitest-environment happy-dom

import { FeedViewType } from "@follow/constants"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { importLocalOpmlSubscriptions, InvalidOpmlError, parseLocalOpml } from "./opml"

const { getSubscriptionByFeedIdMock, previewLocalRssFeedMock, upsertLocalRssSubscriptionMock } =
  vi.hoisted(() => ({
    getSubscriptionByFeedIdMock: vi.fn(),
    previewLocalRssFeedMock: vi.fn(),
    upsertLocalRssSubscriptionMock: vi.fn(),
  }))

vi.mock("@follow/store/subscription/getter", () => ({
  getSubscriptionByFeedId: getSubscriptionByFeedIdMock,
}))

vi.mock("~/modules/local-rss/service", () => ({
  previewLocalRssFeed: previewLocalRssFeedMock,
  upsertLocalRssSubscription: upsertLocalRssSubscriptionMock,
}))

describe("parseLocalOpml", () => {
  it("parses nested categories and removes duplicate feed URLs", () => {
    const result = parseLocalOpml(`<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Technology">
            <outline text="Example Feed" xmlUrl="https://example.com/feed.xml" />
            <outline title="Duplicate" xmlUrl="https://example.com/feed.xml" />
          </outline>
          <outline title="News Feed" xmlUrl="https://news.example.com/rss" />
        </body>
      </opml>`)

    expect(result).toEqual({
      subscriptions: [
        {
          category: "Technology",
          title: "Example Feed",
          url: "https://example.com/feed.xml",
          view: FeedViewType.Articles,
        },
        {
          category: null,
          title: "News Feed",
          url: "https://news.example.com/rss",
          view: FeedViewType.Articles,
        },
      ],
      remaining: 2,
    })
  })

  it("rejects malformed XML and OPML files without feeds", () => {
    expect(() => parseLocalOpml("<opml><body><outline></body></opml>")).toThrow(InvalidOpmlError)
    expect(() => parseLocalOpml("<opml><body /></opml>")).toThrow(InvalidOpmlError)
  })
})

describe("importLocalOpmlSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("imports valid feeds locally while reporting conflicts and per-feed errors", async () => {
    previewLocalRssFeedMock.mockImplementation(async ({ url }: { url: string }) => {
      if (url.includes("broken")) {
        throw new Error("Feed unavailable")
      }

      return {
        feed: {
          id: url.includes("existing") ? "existing-feed" : "new-feed",
          title: "Resolved title",
          url,
        },
      }
    })
    getSubscriptionByFeedIdMock.mockImplementation((feedId: string) =>
      feedId === "existing-feed" ? { feedId } : undefined,
    )

    const result = await importLocalOpmlSubscriptions([
      {
        category: "Technology",
        title: "New feed",
        url: "https://example.com/new.xml",
        view: FeedViewType.Articles,
      },
      {
        category: null,
        title: "Existing feed",
        url: "https://example.com/existing.xml",
        view: FeedViewType.Articles,
      },
      {
        category: null,
        title: "Broken feed",
        url: "https://example.com/broken.xml",
        view: FeedViewType.Articles,
      },
    ])

    expect(upsertLocalRssSubscriptionMock).toHaveBeenCalledTimes(1)
    expect(upsertLocalRssSubscriptionMock).toHaveBeenCalledWith({
      feed: expect.objectContaining({ id: "new-feed" }),
      subscription: {
        category: "Technology",
        feedId: "new-feed",
        hideFromTimeline: false,
        isPrivate: false,
        listId: undefined,
        title: "New feed",
        url: "https://example.com/new.xml",
        view: FeedViewType.Articles,
      },
    })
    expect(result).toEqual({
      successfulItems: [{ id: "new-feed", title: "New feed", url: "https://example.com/new.xml" }],
      conflictItems: [
        {
          id: "existing-feed",
          title: "Existing feed",
          url: "https://example.com/existing.xml",
        },
      ],
      parsedErrorItems: [{ title: "Broken feed", url: "https://example.com/broken.xml" }],
    })
  })
})
