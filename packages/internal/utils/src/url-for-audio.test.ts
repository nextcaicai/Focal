import { describe, expect, it } from "vitest"

import { isPodcastSubscriptionFeed, isPodcastSubscriptionFeedUrl } from "./url-for-audio"

describe("isPodcastSubscriptionFeedUrl", () => {
  it("detects xiaoyuzhou and RSSHub xiaoyuzhou routes", () => {
    expect(isPodcastSubscriptionFeedUrl("https://www.xiaoyuzhoufm.com/podcast/626b46ea")).toBe(true)
    expect(
      isPodcastSubscriptionFeedUrl(
        "https://rsshub.bestblogs.dev/xiaoyuzhou/podcast/626b46ea9cbbf0451cf5a962",
      ),
    ).toBe(true)
  })

  it("detects common podcast hosts", () => {
    expect(isPodcastSubscriptionFeedUrl("https://podcasts.apple.com/cn/podcast/id123")).toBe(true)
    expect(isPodcastSubscriptionFeedUrl("https://feeds.buzzsprout.com/123.rss")).toBe(true)
    expect(isPodcastSubscriptionFeedUrl("https://anchor.fm/s/abc/podcast/rss")).toBe(true)
  })

  it("rejects ordinary article/video feeds", () => {
    expect(isPodcastSubscriptionFeedUrl("https://example.com/rss.xml")).toBe(false)
    expect(
      isPodcastSubscriptionFeedUrl(
        "https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890",
      ),
    ).toBe(false)
    expect(isPodcastSubscriptionFeedUrl("https://1q43.blog/feed")).toBe(false)
  })
})

describe("isPodcastSubscriptionFeed", () => {
  it("matches siteUrl when feed url is a proxy", () => {
    expect(
      isPodcastSubscriptionFeed({
        url: "https://rsshub.example.com/custom/feed",
        siteUrl: "https://www.xiaoyuzhoufm.com/podcast/abc",
      }),
    ).toBe(true)
  })
})
