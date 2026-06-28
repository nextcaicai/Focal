import { describe, expect, it } from "vitest"

import {
  formatTranscriptText,
  parseInlineYoutubeJson,
  pickCaptionTrack,
} from "./youtube-caption-fallback"

describe("youtube-caption-fallback", () => {
  it("parses inline ytInitialPlayerResponse JSON from watch HTML", () => {
    const html = `
      <script>
        var ytInitialPlayerResponse = {"videoDetails":{"videoId":"abc123","title":"Demo"},"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc123","languageCode":"en"}]}}};
      </script>
    `

    const parsed = parseInlineYoutubeJson(html, "ytInitialPlayerResponse")
    expect(parsed?.videoDetails).toEqual({ videoId: "abc123", title: "Demo" })
  })

  it("prefers manually uploaded tracks over ASR when possible", () => {
    const track = pickCaptionTrack(
      [
        { baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "en", kind: "asr" },
        { baseUrl: "https://www.youtube.com/api/timedtext?v=2", languageCode: "en" },
      ],
      "en",
    )

    expect(track?.baseUrl).toContain("v=2")
  })

  it("formats transcript XML segments into Defuddle-style markdown lines", () => {
    const transcript = formatTranscriptText([
      { start: 1, text: "Hello there" },
      { start: 25, text: "General Kenobi" },
    ])

    expect(transcript).toBe("**0:01** · Hello there\n**0:25** · General Kenobi")
  })
})
