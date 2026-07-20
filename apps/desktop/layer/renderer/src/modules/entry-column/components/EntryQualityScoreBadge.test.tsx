/* eslint-disable @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks, @eslint-react/hooks-extra/no-unnecessary-use-prefix -- mocked hooks keep production export names */
import type { RecommendationDiagnostic } from "@follow/shared/entry-rank-score"
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import { EntryQualityScoreBadge } from "./EntryQualityScoreBadge"

const testState = vi.hoisted(() => ({
  librarySearchActive: false,
  routeSmartFeed: undefined as "recommended" | "readLater" | undefined,
  diagnostic: null as RecommendationDiagnostic | null,
}))

const useEntryRecommendationDiagnosticMock = vi.hoisted(() => vi.fn())

vi.mock("@follow/components/ui/hover-card/index.js", () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HoverCardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="hover-content">{children}</div>
  ),
  HoverCardTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@follow/shared/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@follow/shared/constants")>()
  return {
    ...actual,
    LOCAL_RSS_MODE: true,
  }
})

vi.mock("@follow/store/entry-quality-score/hooks", () => ({
  useEntryQualityScore: () => ({
    confidence: 0.8,
    content_types: {
      Tutorial: 0.7,
    },
    negative_reasons: [],
    positive_reasons: ["Detailed evidence"],
    quality_score: 82,
    scores: {
      actionability: 4,
      depth: 4,
      evidence: 4,
      information_gain: 4,
      originality: 4,
      signal_density: 4,
    },
    summary: "A useful entry.",
  }),
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()
  const labels: Record<string, string> = {
    "entry.quality_score.mvp.confidence": "Confidence {{value}}%",
    "entry.quality_score.mvp.content_quality": "Content Quality",
    "entry.quality_score.mvp.content_types": "Content types",
    "entry.quality_score.mvp.dimensions": "Dimension scores",
    "entry.quality_score.mvp.negative": "Weaknesses",
    "entry.quality_score.mvp.positive": "Strengths",
    "entry.quality_score.mvp.title": "Quality score {{score}}",
    "entry.recommendation.diagnostics": "Diagnostics: final {{finalScore}}, state {{stateScore}}",
    "entry.recommendation.feedback.alignment.aligned": "Aligned",
    "entry.recommendation.feedback.alignment_label": "Calibration",
    "entry.recommendation.feedback.alignment.not_enough_data": "Pending",
    "entry.recommendation.feedback.alignment.overranked": "Over-ranked",
    "entry.recommendation.feedback.alignment.underranked": "Under-ranked",
    "entry.recommendation.feedback.delta": "Quality delta",
    "entry.recommendation.feedback.exposed_without_impression": "Seen",
    "entry.recommendation.feedback.exposure": "Exposure",
    "entry.recommendation.feedback.exposure_count": "{{count}}x",
    "entry.recommendation.feedback.not_exposed": "Not exposed",
    "entry.recommendation.feedback.outcome.impression": "Exposed",
    "entry.recommendation.feedback.outcome_label": "Outcome",
    "entry.recommendation.feedback.outcome.none": "No feedback yet",
    "entry.recommendation.feedback.outcome.not_interested": "Not interested",
    "entry.recommendation.feedback.outcome.open": "Opened",
    "entry.recommendation.feedback.outcome.quick_bounce": "Quick bounce",
    "entry.recommendation.feedback.outcome.read_complete": "Read complete",
    "entry.recommendation.feedback.title": "Feedback calibration",
    "entry.recommendation.included": "Included in Recommended",
    "entry.recommendation.reason.quality_score": "Strong content quality",
    "entry.recommendation.reason.state_priority": "Unread or saved state raises priority",
    "entry.recommendation.title": "Recommendation",
  }

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, string | number>) => {
        let label = labels[key] ?? key
        for (const [name, value] of Object.entries(options ?? {})) {
          label = label.replace(`{{${name}}}`, String(value))
        }
        return label
      },
    }),
  }
})

vi.mock("~/atoms/library-search", () => ({
  useLibrarySearchActive: () => testState.librarySearchActive,
}))

vi.mock("~/atoms/settings/general", () => ({
  useGeneralSettingKey: (key: string) => key === "qualityScore",
}))

vi.mock("~/hooks/biz/useRouteParams", () => ({
  useRouteParamsSelector: (
    selector: (route: { smartFeed?: "recommended" | "readLater" }) => unknown,
  ) => selector({ smartFeed: testState.routeSmartFeed }),
}))

vi.mock("../hooks/useEntryRecommendationDiagnostic", () => ({
  useEntryRecommendationDiagnostic: (entryId: string, enabled: boolean) =>
    useEntryRecommendationDiagnosticMock(entryId, enabled),
}))

describe("EntryQualityScoreBadge", () => {
  let root: Root | null = null
  let container: HTMLElement | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }

    container?.remove()
    root = null
    container = null
    testState.librarySearchActive = false
    testState.routeSmartFeed = undefined
    testState.diagnostic = null
    useEntryRecommendationDiagnosticMock.mockReset()
  })

  test("keeps the hover card quality-only outside Recommended mode", async () => {
    useEntryRecommendationDiagnosticMock.mockReturnValue(null)

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<EntryQualityScoreBadge entryId="entry-1" />)
    })

    expect(container.textContent).toContain("Content Quality")
    expect(container.textContent).not.toContain("Recommendation")
    expect(useEntryRecommendationDiagnosticMock).toHaveBeenCalledWith("entry-1", false)
  })

  test("shows recommendation reasons and diagnostics for the dedicated recommended queue", async () => {
    testState.routeSmartFeed = "recommended"
    useEntryRecommendationDiagnosticMock.mockReturnValue({
      candidate: true,
      entryId: "entry-1",
      filterReason: null,
      finalScore: 0.82,
      feedback: {
        alignment: "overranked",
        exposed: true,
        exposureCount: 2,
        latestOutcome: "quick_bounce",
        notInterested: false,
        opened: true,
        qualityDelta: -0.5,
        quickBounced: true,
        readCompleted: false,
      },
      included: true,
      rank: null,
      reasons: [
        {
          code: "quality_score",
          impact: "positive",
          label: "Content quality score 82",
          type: "quality",
          value: 82,
        },
        {
          code: "state_priority",
          impact: "positive",
          label: "Entry state raises recommendation priority",
          type: "state",
          value: 0.06,
        },
      ],
      stateScore: 0.06,
    } satisfies RecommendationDiagnostic)

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<EntryQualityScoreBadge entryId="entry-1" />)
    })

    expect(container.textContent).toContain("Recommendation")
    expect(container.textContent).toContain("Included in Recommended")
    expect(container.textContent).toContain("Strong content quality")
    expect(container.textContent).toContain("Unread or saved state raises priority")
    expect(container.textContent).toContain("Diagnostics: final 0.820, state +0.060")
    expect(container.textContent).toContain("Feedback calibration")
    expect(container.textContent).toContain("2x")
    expect(container.textContent).toContain("Quick bounce")
    expect(container.textContent).toContain("-0.500")
    expect(container.textContent).toContain("Over-ranked")
    expect(useEntryRecommendationDiagnosticMock).toHaveBeenCalledWith("entry-1", true)
  })

  test("does not show recommendation details for the read-later queue", async () => {
    testState.routeSmartFeed = "readLater"
    useEntryRecommendationDiagnosticMock.mockReturnValue(null)

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<EntryQualityScoreBadge entryId="entry-1" />)
    })

    expect(container.textContent).not.toContain("Recommendation")
    expect(useEntryRecommendationDiagnosticMock).toHaveBeenCalledWith("entry-1", false)
  })
})
