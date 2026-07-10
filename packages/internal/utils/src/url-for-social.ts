/**
 * Social / microblog subscription feed detection from URL signals.
 * Used when assigning FeedViewType.SocialMedia at subscribe/hydrate time.
 */

const SOCIAL_HOST_MARKERS = [
  "x.com",
  "twitter.com",
  "mobile.twitter.com",
  "nitter.net",
  "nitter.it",
  "nitter.privacydev.net",
  "v2ex.com",
  "mastodon.social",
  "threads.net",
  "bsky.app",
  "blueskyweb.xyz",
] as const

/** Path segments for RSSHub / proxy social routes. */
const SOCIAL_PATH_MARKERS = [
  "/twitter/",
  "/twitter/user/",
  "/twitter/home",
  "/twitter/keyword/",
  "/twitter/list/",
  "/x/",
  "/nitter/",
  "/mastodon/",
  "/bsky/",
  "/bluesky/",
  "/threads/",
  "/v2ex/",
] as const

export const isSocialSubscriptionFeedUrl = (url: string | null | undefined): boolean => {
  if (!url) return false

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const pathAndQuery = `${parsed.pathname}${parsed.search}`.toLowerCase()

    if (SOCIAL_HOST_MARKERS.some((marker) => host === marker || host.endsWith(`.${marker}`))) {
      return true
    }

    // RSSHub and similar: host is a proxy, path indicates social source.
    if (SOCIAL_PATH_MARKERS.some((marker) => pathAndQuery.includes(marker))) {
      return true
    }

    return false
  } catch {
    const lower = url.toLowerCase()
    return (
      SOCIAL_HOST_MARKERS.some((marker) => lower.includes(marker)) ||
      SOCIAL_PATH_MARKERS.some((marker) => lower.includes(marker))
    )
  }
}

export const isSocialSubscriptionFeed = (feed: {
  url?: string | null
  siteUrl?: string | null
}): boolean => isSocialSubscriptionFeedUrl(feed.url) || isSocialSubscriptionFeedUrl(feed.siteUrl)
