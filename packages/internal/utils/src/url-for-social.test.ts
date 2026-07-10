import { describe, expect, it } from "vitest"

import { isSocialSubscriptionFeed, isSocialSubscriptionFeedUrl } from "./url-for-social"

describe("isSocialSubscriptionFeedUrl", () => {
  it("detects X / Twitter hosts and RSSHub twitter routes", () => {
    expect(isSocialSubscriptionFeedUrl("https://x.com/elonmusk")).toBe(true)
    expect(isSocialSubscriptionFeedUrl("https://twitter.com/elonmusk")).toBe(true)
    expect(isSocialSubscriptionFeedUrl("https://rsshub.app/twitter/user/elonmusk")).toBe(true)
    expect(isSocialSubscriptionFeedUrl("https://rsshub.bestblogs.dev/twitter/user/OpenAI")).toBe(
      true,
    )
  })

  it("detects other common social hosts used as feed sources", () => {
    expect(isSocialSubscriptionFeedUrl("https://nitter.net/elonmusk/rss")).toBe(true)
    expect(isSocialSubscriptionFeedUrl("https://www.v2ex.com/index.xml")).toBe(true)
    expect(isSocialSubscriptionFeedUrl("https://bsky.app/profile/user.bsky.social/rss")).toBe(true)
  })

  it("rejects ordinary article/video/podcast feeds", () => {
    expect(isSocialSubscriptionFeedUrl("https://example.com/rss.xml")).toBe(false)
    expect(
      isSocialSubscriptionFeedUrl(
        "https://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890",
      ),
    ).toBe(false)
    expect(
      isSocialSubscriptionFeedUrl(
        "https://rsshub.bestblogs.dev/xiaoyuzhou/podcast/626b46ea9cbbf0451cf5a962",
      ),
    ).toBe(false)
  })
})

describe("isSocialSubscriptionFeed", () => {
  it("matches siteUrl when feed url is a proxy without social path", () => {
    expect(
      isSocialSubscriptionFeed({
        url: "https://rss-proxy.example.com/custom/feed",
        siteUrl: "https://x.com/someuser",
      }),
    ).toBe(true)
  })
})
