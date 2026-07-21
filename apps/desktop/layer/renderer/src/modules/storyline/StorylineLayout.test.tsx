import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { StorylineLayout } from "./StorylineLayout"

const mocks = vi.hoisted(() => ({
  refreshStorylines: vi.fn(async () => {}),
  showSettings: vi.fn(),
}))

const storylineState = {
  status: "ready",
  storylines: [],
  selectedStorylineId: null,
  recentEntryCount: 0,
  embeddedRecentEntryCount: 0,
  analyzedRecentEntryCount: 0,
  embeddingRecordCount: 0,
  windowStartedAt: 0,
  lastBuiltAt: null,
  errorMessage: null,
}

vi.mock("react-i18next", () => ({
  ["useTranslation"]: () => ({
    t: (key: string) => key,
    i18n: { language: "zh-CN" },
  }),
}))

vi.mock("@follow/store/entry/store", () => ({
  ["useEntryStore"]: (selector: (state: { data: Record<string, never> }) => unknown) =>
    selector({ data: {} }),
}))

vi.mock("@follow/store/entry-embedding/store", () => ({
  ["useEntryEmbeddingStore"]: (
    selector: (state: { data: Record<string, never>; hydrated: boolean }) => unknown,
  ) => selector({ data: {}, hydrated: false }),
}))

vi.mock("@follow/store/storyline/store", () => ({
  storylineActions: { select: vi.fn() },
  ["useStorylineStore"]: (selector: (state: typeof storylineState) => unknown) =>
    selector(storylineState),
}))

vi.mock("~/atoms/settings/ai", () => ({
  ["useAISettingKey"]: () => null,
}))

vi.mock("~/hooks/biz/useNavigateEntry", () => ({
  ["useNavigateEntry"]: () => vi.fn(),
}))

vi.mock("~/modules/ai/local-embedding", () => ({
  isLocalEmbeddingConfigured: () => false,
}))

vi.mock("~/modules/settings/modal/use-setting-modal-hack", () => ({
  ["useSettingModal"]: () => mocks.showSettings,
}))

vi.mock("./analysis", () => ({
  refreshStorylines: mocks.refreshStorylines,
}))

describe("StorylineLayout", () => {
  let root: Root | null = null
  let container: HTMLElement | null = null

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    mocks.showSettings.mockClear()
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
  })

  test("opens the AI settings modal from the embedding setup state", async () => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<StorylineLayout />)
    })

    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent === "storyline.open_ai_settings",
    )
    expect(button).toBeTruthy()

    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(mocks.showSettings).toHaveBeenCalledOnce()
    expect(mocks.showSettings).toHaveBeenCalledWith("ai")
  })
})
