import type { EntryModel } from "@follow/store/entry/types"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getIntegrationEntryDescription } from "./integration-entry-description"

const { getGeneralSettingsMock, getActionLanguageMock, getSummaryMock } = vi.hoisted(() => ({
  getGeneralSettingsMock: vi.fn(),
  getActionLanguageMock: vi.fn(),
  getSummaryMock: vi.fn(),
}))

vi.mock("~/atoms/settings/general", () => ({
  getGeneralSettings: getGeneralSettingsMock,
  getActionLanguage: getActionLanguageMock,
}))

vi.mock("@follow/store/summary/getters", () => ({
  getSummary: getSummaryMock,
}))

const entry = {
  id: "entry-1",
  description: "RSS description",
} as EntryModel

describe("getIntegrationEntryDescription", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns RSS description when AI summary is disabled", () => {
    getGeneralSettingsMock.mockReturnValue({ summary: false })
    getActionLanguageMock.mockReturnValue("en")

    expect(getIntegrationEntryDescription(entry)).toBe("RSS description")
    expect(getSummaryMock).not.toHaveBeenCalled()
  })

  it("prefers readability summary when AI summary is enabled", () => {
    getGeneralSettingsMock.mockReturnValue({ summary: true })
    getActionLanguageMock.mockReturnValue("en")
    getSummaryMock.mockReturnValue({
      readabilitySummary: "AI readability summary",
      summary: "AI summary",
    })

    expect(getIntegrationEntryDescription(entry)).toBe("AI readability summary")
  })

  it("falls back to RSS description when no cached summary exists", () => {
    getGeneralSettingsMock.mockReturnValue({ summary: true })
    getActionLanguageMock.mockReturnValue("en")
    getSummaryMock.mockImplementation(() => {})

    expect(getIntegrationEntryDescription(entry)).toBe("RSS description")
  })
})
