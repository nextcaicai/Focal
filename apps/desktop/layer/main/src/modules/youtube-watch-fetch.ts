import { normalizeYouTubeWatchUrl } from "@follow/utils/url-for-video"

import { BOT_UA, DEFAULT_UA, fetchPage, getInitialUA } from "./defuddle-official-fetch"
import {
  CHROME_USER_AGENT,
  fetchYouTubeResource,
  readResponseText,
  YOUTUBE_CONSENT_COOKIE,
} from "./youtube-http"

export interface YouTubeWatchPage {
  strategy: string
  url: string
  html: string
}

const WATCH_PAGE_MIN_BYTES = 10_000
const RETRY_DELAY_MS = 600

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const toMobileWatchUrl = (watchUrl: string) => {
  const url = new URL(watchUrl)
  url.hostname = "m.youtube.com"
  return url.toString()
}

const fingerprintPage = (html: string) => `${html.length}:${html.slice(0, 2048)}`

const withRetry = async <T>(task: () => Promise<T | null>, attempts = 2) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await task()
      if (result) {
        return result
      }
    } catch {
      // Try the next attempt below.
    }

    if (attempt < attempts - 1) {
      await sleep(RETRY_DELAY_MS * (attempt + 1))
    }
  }

  return null
}

const fetchHtmlViaElectronSession = async (url: string, language?: string) => {
  const response = await fetchYouTubeResource(url, {
    language,
    headers: {
      "User-Agent": CHROME_USER_AGENT,
    },
  })

  if (!response?.ok) {
    return null
  }

  return readResponseText(response)
}

const fetchHtmlViaChrome = async (url: string, language?: string) => {
  const response = await fetchYouTubeResource(url, {
    language,
    headers: {
      "User-Agent": CHROME_USER_AGENT,
      Cookie: YOUTUBE_CONSENT_COOKIE,
    },
  })

  if (!response?.ok) {
    return null
  }

  return readResponseText(response)
}

const fetchHtmlViaDefuddle = async (url: string, userAgent: string, language?: string) => {
  return fetchPage(url, userAgent, language)
}

const buildWatchPageStrategies = (watchUrl: string, language?: string) => {
  const normalizedUrl = normalizeYouTubeWatchUrl(watchUrl) ?? watchUrl
  const mobileUrl = toMobileWatchUrl(normalizedUrl)

  return [
    {
      name: "electron-session",
      url: normalizedUrl,
      fetch: () => fetchHtmlViaElectronSession(normalizedUrl, language),
    },
    {
      name: "chrome-consent",
      url: normalizedUrl,
      fetch: () => fetchHtmlViaChrome(normalizedUrl, language),
    },
    {
      name: "defuddle-default",
      url: normalizedUrl,
      fetch: () => fetchHtmlViaDefuddle(normalizedUrl, getInitialUA(normalizedUrl), language),
    },
    {
      name: "defuddle-bot",
      url: normalizedUrl,
      fetch: () => fetchHtmlViaDefuddle(normalizedUrl, BOT_UA, language),
    },
    {
      name: "electron-session-mobile",
      url: mobileUrl,
      fetch: () => fetchHtmlViaElectronSession(mobileUrl, language),
    },
    {
      name: "chrome-consent-mobile",
      url: mobileUrl,
      fetch: () => fetchHtmlViaChrome(mobileUrl, language),
    },
    {
      name: "defuddle-default-mobile",
      url: mobileUrl,
      fetch: () => fetchHtmlViaDefuddle(mobileUrl, DEFAULT_UA, language),
    },
  ]
}

export async function* iterateYouTubeWatchPages(
  watchUrl: string,
  language?: string,
): AsyncGenerator<YouTubeWatchPage> {
  const seen = new Set<string>()

  for (const strategy of buildWatchPageStrategies(watchUrl, language)) {
    const html = await withRetry(() => strategy.fetch())
    if (!html || html.length < WATCH_PAGE_MIN_BYTES) {
      continue
    }

    const fingerprint = fingerprintPage(html)
    if (seen.has(fingerprint)) {
      continue
    }
    seen.add(fingerprint)

    yield {
      strategy: strategy.name,
      url: strategy.url,
      html,
    }
  }
}
