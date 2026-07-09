import { describe, expect, test } from "vitest"

import { getEntrySummaryDescription } from "./useEntrySummaryDescription"

describe("entry summary description", () => {
  test("prefers quality score summary over existing AI summary and RSS description", () => {
    expect(
      getEntrySummaryDescription({
        fallback: "Original RSS description",
        qualityScoreSummary: "Quality score summary",
        summary: "AI summary",
      }),
    ).toEqual({
      description: "Quality score summary",
      isSummary: true,
    })
  })

  test("falls back to existing AI summary before RSS description", () => {
    expect(
      getEntrySummaryDescription({
        fallback: "Original RSS description",
        summary: "AI summary",
      }),
    ).toEqual({
      description: "AI summary",
      isSummary: true,
    })
  })

  test("uses RSS description only when generated summaries are unavailable", () => {
    expect(
      getEntrySummaryDescription({
        fallback: "Original RSS description",
      }),
    ).toEqual({
      description: "Original RSS description",
      isSummary: false,
    })
  })

  test("normalizes markdown from generated summaries", () => {
    expect(
      getEntrySummaryDescription({
        fallback: "Original RSS description",
        qualityScoreSummary: "**Important** [link](https://example.com)",
      }),
    ).toEqual({
      description: "Important link",
      isSummary: true,
    })
  })
})
