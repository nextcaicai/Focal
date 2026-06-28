import { normalizeYouTubeWatchUrl } from "@follow/utils/url-for-video"

import { fetchYouTubeResource, readResponseText } from "./youtube-http"

interface CaptionTrack {
  baseUrl?: string
  languageCode?: string
  kind?: string
  name?: {
    simpleText?: string
    runs?: Array<{ text?: string }>
  }
}

interface TranscriptSegment {
  start: number
  text: string
}

interface TranscriptFallbackResult {
  transcript: string
  title: string | null
}

const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
const INNERTUBE_ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14)"
const CAPTION_FETCH_TIMEOUT_MS = 15_000

const normalizeLanguageCode = (code?: string) =>
  (code || "").trim().replaceAll("_", "-").toLowerCase()

const formatTranscriptTimestamp = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

const decodeEntities = (text: string) =>
  text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replaceAll(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))

export const parseInlineYoutubeJson = (html: string, globalName: string) => {
  const markerIndex = html.indexOf(globalName)
  if (markerIndex === -1) {
    return null
  }

  const startIndex = html.indexOf("{", markerIndex)
  if (startIndex === -1) {
    return null
  }

  let depth = 0
  for (let index = startIndex; index < html.length; index += 1) {
    const char = html[index]
    if (char === "{") {
      depth += 1
    } else if (char === "}") {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(startIndex, index + 1)) as Record<string, unknown>
        } catch {
          return null
        }
      }
    }
  }

  return null
}

const getVideoId = (watchUrl: string) => {
  const url = new URL(watchUrl)
  if (url.hostname === "youtu.be") {
    return url.pathname.slice(1) || null
  }

  if (url.pathname.includes("/shorts/")) {
    return url.pathname.split("/shorts/")[1]?.split("/")[0] || null
  }

  return url.searchParams.get("v")
}

const getCaptionTracks = (playerData: Record<string, unknown> | null) => {
  const captions = playerData?.captions as
    | { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } }
    | undefined
  const tracks = captions?.playerCaptionsTracklistRenderer?.captionTracks
  return Array.isArray(tracks) ? tracks : []
}

const findPreferredCaptionTrack = (captionTracks: CaptionTrack[], preferredLang: string) => {
  const normalized = normalizeLanguageCode(preferredLang)
  if (!normalized) {
    return
  }

  const base = normalized.split("-")[0]
  const entries = captionTracks.map((track) => ({
    track,
    code: normalizeLanguageCode(track.languageCode),
  }))

  const findBest = (predicate: (entry: { code: string }) => boolean) => {
    const matches = entries.filter(predicate)
    return (matches.find(({ track }) => track.kind !== "asr") ?? matches[0])?.track
  }

  return (
    findBest(({ code }) => code === normalized) ??
    findBest(({ code }) => code === base) ??
    findBest(({ code }) => code.split("-")[0] === base)
  )
}

export const pickCaptionTrack = (captionTracks: CaptionTrack[], language?: string) => {
  if (captionTracks.length === 0) {
    return
  }

  if (language) {
    const preferred = findPreferredCaptionTrack(captionTracks, language)
    if (preferred?.baseUrl) {
      return preferred
    }
  }

  const nonAsr = captionTracks.filter((track) => track.kind !== "asr")
  const pool = nonAsr.length > 0 ? nonAsr : captionTracks
  return (
    pool.find((track) => track.languageCode === "en" && track.baseUrl) ||
    pool.find((track) => track.baseUrl)
  )
}

const getValidatedPlayerResponse = (html: string, videoId: string) => {
  const data = parseInlineYoutubeJson(html, "ytInitialPlayerResponse")
  if (!data) {
    return null
  }

  const videoDetails = data.videoDetails as { videoId?: string } | undefined
  const microformat = data.microformat as
    | { playerMicroformatRenderer?: { externalVideoId?: string } }
    | undefined

  const detailVideoId = videoDetails?.videoId
  const microformatVideoId = microformat?.playerMicroformatRenderer?.externalVideoId
  if (detailVideoId !== videoId && microformatVideoId !== videoId) {
    return null
  }

  return data
}

const getPlayerTitle = (playerData: Record<string, unknown> | null) => {
  const videoDetails = playerData?.videoDetails as { title?: string } | undefined
  return videoDetails?.title?.trim() || null
}

const parseTranscriptXml = (xml: string): TranscriptSegment[] => {
  const segments: TranscriptSegment[] = []
  const paragraphRegex = /<p\s+t="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
  let match = paragraphRegex.exec(xml)

  while (match) {
    const startMs = Number.parseInt(match[1] ?? "0", 10)
    const inner = match[2] ?? ""
    let text = ""
    const wordRegex = /<s[^>]*>([^<]*)<\/s>/g
    let wordMatch = wordRegex.exec(inner)

    while (wordMatch) {
      text += wordMatch[1] ?? ""
      wordMatch = wordRegex.exec(inner)
    }

    if (!text) {
      text = inner.replaceAll(/<[^>]+>/g, "")
    }

    text = decodeEntities(
      text
        .replaceAll("\n", " ")
        .replaceAll(/\s{2,}/g, " ")
        .trim(),
    )
    if (text) {
      segments.push({ start: startMs / 1000, text })
    }

    match = paragraphRegex.exec(xml)
  }

  if (segments.length > 0) {
    return segments
  }

  const textRegex = /<text\s+start="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g
  match = textRegex.exec(xml)
  while (match) {
    const start = Number.parseFloat(match[1] ?? "0")
    const text = decodeEntities(
      (match[2] ?? "")
        .replaceAll(/<[^>]+>/g, "")
        .replaceAll("\n", " ")
        .replaceAll(/\s{2,}/g, " ")
        .trim(),
    )
    if (text) {
      segments.push({ start, text })
    }
    match = textRegex.exec(xml)
  }

  return segments
}

const groupTranscriptSegments = (segments: TranscriptSegment[]) => {
  if (segments.length === 0) {
    return []
  }

  const groups: Array<{ start: number; text: string }> = []
  let current = { start: segments[0]!.start, text: segments[0]!.text }

  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index]!
    const gapSeconds = segment.start - current.start
    const currentWords = current.text.split(/\s+/).length

    if (gapSeconds > 20 || currentWords > 80) {
      groups.push(current)
      current = { start: segment.start, text: segment.text }
      continue
    }

    current.text = `${current.text} ${segment.text}`
  }

  groups.push(current)
  return groups
}

export const formatTranscriptText = (segments: TranscriptSegment[]) => {
  const groups = groupTranscriptSegments(segments)
  return groups
    .map((segment) => `**${formatTranscriptTimestamp(segment.start)}** · ${segment.text}`)
    .join("\n")
}

const fetchCaptionXml = async (track: CaptionTrack, language?: string) => {
  if (!track.baseUrl) {
    return null
  }

  const captionUrl = new URL(track.baseUrl)
  if (!captionUrl.hostname.endsWith(".youtube.com")) {
    return null
  }

  const response = await fetchYouTubeResource(track.baseUrl, {
    language,
    timeoutMs: CAPTION_FETCH_TIMEOUT_MS,
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  })

  if (!response?.ok) {
    return null
  }

  return readResponseText(response)
}

const fetchInnertubePlayerData = async (videoId: string, language?: string) => {
  const clients = [
    {
      headers: { "Content-Type": "application/json" },
      context: { client: { clientName: "IOS", clientVersion: "20.10.3" } },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": INNERTUBE_ANDROID_UA,
      },
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
    },
    {
      headers: { "Content-Type": "application/json" },
      context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00" } },
    },
  ] as const

  for (const client of clients) {
    const response = await fetchYouTubeResource(INNERTUBE_API_URL, {
      method: "POST",
      language,
      timeoutMs: CAPTION_FETCH_TIMEOUT_MS,
      headers: client.headers,
      body: JSON.stringify({
        context: client.context,
        videoId,
      }),
    })

    if (!response?.ok) {
      continue
    }

    const data = (await response.json()) as Record<string, unknown>
    if (getCaptionTracks(data).length > 0) {
      return data
    }
  }

  return null
}

export const fetchTranscriptFromWatchHtml = async (
  html: string,
  watchUrl: string,
  language?: string,
): Promise<TranscriptFallbackResult | null> => {
  const normalizedUrl = normalizeYouTubeWatchUrl(watchUrl) ?? watchUrl
  const videoId = getVideoId(normalizedUrl)
  if (!videoId) {
    return null
  }

  const inlinePlayer = getValidatedPlayerResponse(html, videoId)
  let playerData = inlinePlayer
  let captionTracks = getCaptionTracks(playerData)

  if (captionTracks.length === 0) {
    playerData = await fetchInnertubePlayerData(videoId, language)
    captionTracks = getCaptionTracks(playerData)
  }

  const track = pickCaptionTrack(captionTracks, language)
  if (!track) {
    return null
  }

  const xml = await fetchCaptionXml(track, language)
  if (!xml) {
    return null
  }

  const segments = parseTranscriptXml(xml)
  const transcript = formatTranscriptText(segments)
  if (!transcript.trim()) {
    return null
  }

  return {
    transcript,
    title: getPlayerTitle(playerData),
  }
}
