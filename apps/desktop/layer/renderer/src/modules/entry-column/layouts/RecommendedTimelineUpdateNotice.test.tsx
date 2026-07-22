/* eslint-disable @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks, @eslint-react/hooks-extra/no-unnecessary-use-prefix -- mocked hooks keep production export names */
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import { RecommendedTimelineUpdateNotice } from "./RecommendedTimelineUpdateNotice"

const noticeState = vi.hoisted(() => ({
  smartFeed: "recommended" as "recommended" | "today",
  updatePending: true,
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "entry_list_header.recommendations_updated_action"
        ? "Recommendations updated · View"
        : key,
  }),
}))

vi.mock("~/hooks/biz/useRouteParams", () => ({
  useRouteParams: () => ({ smartFeed: noticeState.smartFeed }),
}))

vi.mock("../recommended-timeline-session", () => ({
  useRecommendedTimelineSession: () => ({ updatePending: noticeState.updatePending }),
}))

describe("RecommendedTimelineUpdateNotice", () => {
  let container: HTMLElement | null = null
  let root: Root | null = null

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
    container = null
    root = null
    noticeState.smartFeed = "recommended"
    noticeState.updatePending = true
  })

  test("shows the update action only for a pending Recommended timeline", async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    const onView = vi.fn()

    await act(async () => {
      root?.render(<RecommendedTimelineUpdateNotice onView={onView} />)
    })

    expect(container.textContent).toContain("Recommendations updated · View")

    const button = container.querySelector("button")
    expect(button).toBeTruthy()
    await act(async () => {
      button?.click()
    })

    expect(onView).toHaveBeenCalledOnce()
  })

  test("stays hidden outside the Recommended timeline", async () => {
    noticeState.smartFeed = "today"
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RecommendedTimelineUpdateNotice onView={vi.fn()} />)
    })

    expect(container.querySelector("button")).toBeNull()
  })
})
