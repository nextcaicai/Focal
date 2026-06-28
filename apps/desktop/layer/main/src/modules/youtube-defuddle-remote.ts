import { normalizeYouTubeWatchUrl } from "@follow/utils/url-for-video"

const DEFUDDLE_MD_ORIGIN = "https://defuddle.md"
const TRANSCRIPT_MARKERS = [/##\s*Transcript/i, /\*\*\d+:\d+(?::\d+)?\*\*/]

const hasYouTubeTranscriptContent = (content: string | null | undefined) => {
  if (!content?.trim()) return false
  const normalized = content.trim()
  return TRANSCRIPT_MARKERS.some((pattern) => pattern.test(normalized))
}
const REMOTE_TIMEOUT_MS = 30_000

export interface DefuddleMdParsedResponse {
  title: string | null
  content: string
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

const parseYamlTitle = (frontmatter: string) => {
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.startsWith("title:")) {
      continue
    }

    const raw = line.slice("title:".length).trim()
    if (!raw) {
      return null
    }

    if (raw.startsWith('"') && raw.endsWith('"')) {
      return raw.slice(1, -1).replaceAll('\\"', '"').trim()
    }

    return raw
  }

  return null
}

export const parseDefuddleMdResponse = (body: string): DefuddleMdParsedResponse => {
  const trimmed = body.trim()
  const match = trimmed.match(FRONTMATTER_REGEX)

  if (!match) {
    return {
      title: null,
      content: trimmed,
    }
  }

  return {
    title: parseYamlTitle(match[1] ?? ""),
    content: (match[2] ?? "").trim(),
  }
}

const buildDefuddleMdApiUrl = (watchUrl: string) => {
  const canonicalUrl = normalizeYouTubeWatchUrl(watchUrl)
  const withoutProtocol = canonicalUrl.replace(/^https?:\/\//, "")
  return `${DEFUDDLE_MD_ORIGIN}/${withoutProtocol}`
}

export const fetchYouTubeDefuddleRemote = async (watchUrl: string) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS)

  try {
    const response = await fetch(buildDefuddleMdApiUrl(watchUrl), {
      method: "GET",
      headers: {
        Accept: "text/markdown,text/plain,*/*",
      },
      redirect: "follow",
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    const body = await response.text()
    const parsed = parseDefuddleMdResponse(body)

    if (!hasYouTubeTranscriptContent(parsed.content)) {
      return null
    }

    return {
      content: parsed.content,
      title: parsed.title,
    }
  } catch (error) {
    console.error("YouTube Defuddle remote API failed", error)
    return null
  } finally {
    clearTimeout(timer)
  }
}
