import { Defuddle } from "defuddle/node"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchTranscriptFromWatchHtml } from "./youtube-caption-fallback"
import {
  fetchYouTubeDefuddle,
  hasYouTubeTranscriptContent,
  resolveYouTubeTranscriptContent,
} from "./youtube-defuddle"
import { fetchYouTubeDefuddleRemote } from "./youtube-defuddle-remote"
import { iterateYouTubeWatchPages } from "./youtube-watch-fetch"

vi.mock("defuddle/node", () => ({
  Defuddle: vi.fn(),
}))

vi.mock("./youtube-watch-fetch", () => ({
  iterateYouTubeWatchPages: vi.fn(),
}))

vi.mock("./youtube-caption-fallback", () => ({
  fetchTranscriptFromWatchHtml: vi.fn(),
}))

vi.mock("./youtube-defuddle-remote", () => ({
  fetchYouTubeDefuddleRemote: vi.fn(),
}))

const watchPageHtml = "<html><body>watch page</body></html>"

async function* singleWatchPage(watchUrl: string) {
  yield {
    strategy: "electron-session",
    url: watchUrl,
    html: watchPageHtml,
  }
}

describe("hasYouTubeTranscriptContent", () => {
  it("accepts Defuddle markdown with a transcript heading", () => {
    expect(hasYouTubeTranscriptContent("## Transcript\n\n**0:01** Hello")).toBe(true)
  })

  it("accepts transcript variable text with bold timestamps", () => {
    expect(hasYouTubeTranscriptContent("**0:01** · Hello there")).toBe(true)
  })

  it("rejects embed-only markdown", () => {
    expect(hasYouTubeTranscriptContent("![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)")).toBe(
      false,
    )
  })
})

describe("resolveYouTubeTranscriptContent", () => {
  const watchUrl = "https://www.youtube.com/watch?v=Ju8LVdvuxGM"

  it("returns markdown content when transcript markers are present", () => {
    const content = "## Transcript\n\n**0:01** Hello"
    expect(resolveYouTubeTranscriptContent({ contentMarkdown: content }, watchUrl)).toBe(content)
  })

  it("falls back to variables.transcript when markdown only contains the embed", () => {
    const resolved = resolveYouTubeTranscriptContent(
      {
        contentMarkdown: `![](${watchUrl})`,
        variables: {
          transcript: "**0:01** · Hello there",
        },
      },
      watchUrl,
    )

    expect(resolved).toBe(
      [`![](${watchUrl})`, "", "## Transcript", "", "**0:01** · Hello there"].join("\n"),
    )
  })
})

describe("fetchYouTubeDefuddle", () => {
  beforeEach(() => {
    vi.mocked(iterateYouTubeWatchPages).mockReset()
    vi.mocked(Defuddle).mockReset()
    vi.mocked(fetchTranscriptFromWatchHtml).mockReset()
    vi.mocked(fetchYouTubeDefuddleRemote).mockReset()
    vi.mocked(fetchYouTubeDefuddleRemote).mockResolvedValue(null)
  })

  it("returns null for non-YouTube URLs", async () => {
    await expect(fetchYouTubeDefuddle({ url: "https://example.com/article" })).resolves.toBeNull()
  })

  it("parses transcript markdown from the first successful watch page", async () => {
    const watchUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    const transcript = "## Transcript\n\n**0:01** · Hello"

    vi.mocked(iterateYouTubeWatchPages).mockImplementation(() => singleWatchPage(watchUrl))
    vi.mocked(Defuddle).mockResolvedValue({
      content: "",
      contentMarkdown: `![](${watchUrl})\n\n${transcript}`,
      title: "Test video",
      description: "",
      domain: "youtube.com",
      favicon: "",
      image: "",
      language: "en",
      parseTime: 0,
      published: "",
      author: "",
      site: "YouTube",
      schemaOrgData: null,
      wordCount: 0,
    })

    const result = await fetchYouTubeDefuddle({ url: watchUrl }, "en")

    expect(iterateYouTubeWatchPages).toHaveBeenCalledWith(watchUrl, "en")
    expect(Defuddle).toHaveBeenCalledWith(watchPageHtml, watchUrl, {
      markdown: true,
      useAsync: true,
      language: "en",
    })
    expect(fetchTranscriptFromWatchHtml).not.toHaveBeenCalled()
    expect(result).toEqual({
      content: `![](${watchUrl})\n\n${transcript}`,
      title: "Test video",
    })
  })

  it("falls back to variables.transcript when markdown only contains the embed", async () => {
    const watchUrl = "https://www.youtube.com/watch?v=Ju8LVdvuxGM"

    vi.mocked(iterateYouTubeWatchPages).mockImplementation(() => singleWatchPage(watchUrl))
    vi.mocked(Defuddle).mockResolvedValue({
      content: "",
      contentMarkdown: `![](${watchUrl})`,
      title: "",
      description: "",
      domain: "youtube.com",
      favicon: "",
      image: "",
      language: "en",
      parseTime: 0,
      published: "",
      author: "",
      site: "YouTube",
      schemaOrgData: null,
      wordCount: 0,
      variables: {
        transcript: "**0:12** · India can create the largest AI companies",
        title: "YC talk",
      },
    })

    const result = await fetchYouTubeDefuddle({ url: watchUrl }, "en")

    expect(result).toEqual({
      content: [
        `![](${watchUrl})`,
        "",
        "## Transcript",
        "",
        "**0:12** · India can create the largest AI companies",
      ].join("\n"),
      title: "YC talk",
    })
  })

  it("uses the caption fallback when Defuddle returns no transcript", async () => {
    const watchUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    vi.mocked(iterateYouTubeWatchPages).mockImplementation(() => singleWatchPage(watchUrl))
    vi.mocked(Defuddle).mockResolvedValue({
      content: "",
      contentMarkdown: `![](${watchUrl})`,
      title: "",
      description: "",
      domain: "youtube.com",
      favicon: "",
      image: "",
      language: "en",
      parseTime: 0,
      published: "",
      author: "",
      site: "YouTube",
      schemaOrgData: null,
      wordCount: 0,
    })
    vi.mocked(fetchTranscriptFromWatchHtml).mockResolvedValue({
      transcript: "**0:05** · Fallback transcript",
      title: "Fallback title",
    })

    const result = await fetchYouTubeDefuddle({ url: watchUrl }, "en")

    expect(fetchTranscriptFromWatchHtml).toHaveBeenCalledWith(watchPageHtml, watchUrl, "en")
    expect(result).toEqual({
      content: [`![](${watchUrl})`, "", "## Transcript", "", "**0:05** · Fallback transcript"].join(
        "\n",
      ),
      title: "Fallback title",
    })
  })

  it("uses defuddle.md remote API before local strategies", async () => {
    const watchUrl = "https://www.youtube.com/watch?v=HQGUed-e2wM"

    vi.mocked(fetchYouTubeDefuddleRemote).mockResolvedValue({
      title: "Codex guide",
      content: `![](${watchUrl})\n\n## Transcript\n\n**0:00** · Remote transcript`,
    })

    const result = await fetchYouTubeDefuddle({ url: watchUrl }, "zh-CN")

    expect(fetchYouTubeDefuddleRemote).toHaveBeenCalledWith(watchUrl)
    expect(iterateYouTubeWatchPages).not.toHaveBeenCalled()
    expect(result).toEqual({
      title: "Codex guide",
      content: `![](${watchUrl})\n\n## Transcript\n\n**0:00** · Remote transcript`,
    })
  })
})
