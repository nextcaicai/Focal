import {
  isYouTubeWatchUrl,
  normalizeYouTubeWatchUrl,
  resolveYouTubeWatchUrl,
} from "@follow/utils/url-for-video"
import { Defuddle } from "defuddle/node"

import { fetchTranscriptFromWatchHtml } from "./youtube-caption-fallback"
import { fetchYouTubeDefuddleRemote } from "./youtube-defuddle-remote"
import { iterateYouTubeWatchPages } from "./youtube-watch-fetch"

export interface YouTubeDefuddleResult {
  content: string
  title: string | null
}

interface DefuddleLikeResult {
  content?: string
  contentMarkdown?: string
  title?: string
  variables?: Record<string, string>
}

const TRANSCRIPT_MARKERS = [/##\s*Transcript/i, /\*\*\d+:\d+(?::\d+)?\*\*/]

export const hasYouTubeTranscriptContent = (content: string | null | undefined) => {
  if (!content?.trim()) return false
  const normalized = content.trim()
  return TRANSCRIPT_MARKERS.some((pattern) => pattern.test(normalized))
}

export const resolveYouTubeTranscriptContent = (
  result: DefuddleLikeResult,
  watchUrl: string,
): string | null => {
  const markdown = (result.contentMarkdown ?? result.content)?.trim()

  if (markdown && hasYouTubeTranscriptContent(markdown)) {
    return markdown
  }

  const transcriptVariable = result.variables?.transcript?.trim()
  if (!transcriptVariable || !hasYouTubeTranscriptContent(transcriptVariable)) {
    return null
  }

  return [`![](${watchUrl})`, "", "## Transcript", "", transcriptVariable].join("\n")
}

const mapLanguageCandidates = (language?: string) => {
  const candidates = new Set<string>()

  if (language && language !== "default") {
    candidates.add(language)
    if (language.startsWith("zh")) {
      candidates.add("zh-CN")
      candidates.add("zh")
    }
  }

  candidates.add("en")
  candidates.add("en-US")

  return [...candidates]
}

const parseWithLanguage = async (html: string, watchUrl: string, language: string) => {
  return Defuddle(html, watchUrl, {
    markdown: true,
    useAsync: true,
    language,
  })
}

const resolveFromDefuddle = (result: DefuddleLikeResult, watchUrl: string) => {
  const content = resolveYouTubeTranscriptContent(result, watchUrl)
  if (!content) {
    return null
  }

  return {
    content,
    title: result.title?.trim() || result.variables?.title?.trim() || null,
  }
}

const resolveFromCaptionFallback = async (html: string, watchUrl: string, language: string) => {
  const fallback = await fetchTranscriptFromWatchHtml(html, watchUrl, language)
  if (!fallback) {
    return null
  }

  const content = resolveYouTubeTranscriptContent(
    { variables: { transcript: fallback.transcript } },
    watchUrl,
  )

  if (!content) {
    return null
  }

  return {
    content,
    title: fallback.title,
  }
}

const fetchYouTubeDefuddleLocal = async (watchUrl: string, language?: string) => {
  const languages = mapLanguageCandidates(language)
  const preferredLanguage = languages[0]

  for await (const page of iterateYouTubeWatchPages(watchUrl, preferredLanguage)) {
    for (const candidate of languages) {
      try {
        const result = await parseWithLanguage(page.html, watchUrl, candidate)
        const resolved = resolveFromDefuddle(result, watchUrl)
        if (resolved) {
          return resolved
        }
      } catch (error) {
        console.error(`YouTube Defuddle failed for ${page.strategy} / language ${candidate}`, error)
      }
    }

    for (const candidate of languages) {
      try {
        const resolved = await resolveFromCaptionFallback(page.html, watchUrl, candidate)
        if (resolved) {
          return resolved
        }
      } catch (error) {
        console.error(
          `YouTube caption fallback failed for ${page.strategy} / language ${candidate}`,
          error,
        )
      }
    }
  }

  return null
}

export async function fetchYouTubeDefuddle(
  input: {
    url?: string | null
    guid?: string | null
  },
  language?: string,
): Promise<YouTubeDefuddleResult | null> {
  const watchUrl =
    resolveYouTubeWatchUrl(input) ?? (input.url ? normalizeYouTubeWatchUrl(input.url) : null)
  if (!watchUrl || !isYouTubeWatchUrl(watchUrl)) {
    return null
  }

  try {
    const remote = await fetchYouTubeDefuddleRemote(watchUrl)
    if (remote) {
      return remote
    }
  } catch (error) {
    console.error("YouTube Defuddle remote API failed", error)
  }

  try {
    return await fetchYouTubeDefuddleLocal(watchUrl, language)
  } catch (error) {
    console.error("YouTube Defuddle local fallback failed", error)
    return null
  }
}
