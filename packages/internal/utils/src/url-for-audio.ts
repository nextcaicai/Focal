/**
 * Podcast / audio subscription feed detection from URL signals.
 * Used when assigning FeedViewType.Audios at subscribe/hydrate time.
 */

const PODCAST_HOST_MARKERS = [
  "xiaoyuzhoufm.com",
  "podcasts.apple.com",
  "anchor.fm",
  "pocketcasts.com",
  "pca.st",
  "overcast.fm",
  "castro.fm",
  "buzzsprout.com",
  "libsyn.com",
  "transistor.fm",
  "simplecast.com",
  "megaphone.fm",
  "spreaker.com",
  "fireside.fm",
  "captivate.fm",
  "rss.com",
  "acast.com",
  "podbean.com",
  "soundcloud.com",
] as const

/** Path segments that strongly indicate a podcast feed (incl. RSSHub routes). */
const PODCAST_PATH_MARKERS = ["/xiaoyuzhou/", "/podcast/", "/podcasts/", "format=audio"] as const

export const isPodcastSubscriptionFeedUrl = (url: string | null | undefined): boolean => {
  if (!url) return false

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const pathAndQuery = `${parsed.pathname}${parsed.search}`.toLowerCase()

    if (PODCAST_HOST_MARKERS.some((marker) => host === marker || host.endsWith(`.${marker}`))) {
      return true
    }

    // RSSHub and similar proxies: host is not a podcast host, path is.
    if (PODCAST_PATH_MARKERS.some((marker) => pathAndQuery.includes(marker))) {
      return true
    }

    // Generic "podcast" token in path (e.g. /feeds/podcast.xml)
    if (/(?:^|\/)podcasts?(?:[/.?]|$)/i.test(pathAndQuery)) {
      return true
    }

    return false
  } catch {
    const lower = url.toLowerCase()
    return (
      PODCAST_HOST_MARKERS.some((marker) => lower.includes(marker)) ||
      PODCAST_PATH_MARKERS.some((marker) => lower.includes(marker)) ||
      lower.includes("podcast")
    )
  }
}

export const isPodcastSubscriptionFeed = (feed: {
  url?: string | null
  siteUrl?: string | null
}): boolean => isPodcastSubscriptionFeedUrl(feed.url) || isPodcastSubscriptionFeedUrl(feed.siteUrl)
