import { describe, expect, it } from "vitest"

import { hasChangelogContent, resolveChangelogContent } from "./changelog"

describe("resolveChangelogContent", () => {
  const contents = {
    en: "English changelog",
    "zh-CN": "简体中文更新日志",
    "zh-TW": "",
    ja: "",
    "fr-FR": "",
  }

  it("returns content for the requested language", () => {
    expect(resolveChangelogContent(contents, "en")).toBe("English changelog")
    expect(resolveChangelogContent(contents, "zh-CN")).toBe("简体中文更新日志")
  })

  it("falls back to zh-CN and then en for zh-TW", () => {
    expect(resolveChangelogContent(contents, "zh-TW")).toBe("简体中文更新日志")
  })

  it("falls back to en for unsupported languages", () => {
    expect(resolveChangelogContent(contents, "de")).toBe("English changelog")
  })

  it("returns empty string when no content exists", () => {
    expect(resolveChangelogContent({}, "en")).toBe("")
  })
})

describe("hasChangelogContent", () => {
  it("returns true when any locale has content", () => {
    expect(hasChangelogContent({ en: "English changelog" })).toBe(true)
  })

  it("returns false when all locales are empty", () => {
    expect(hasChangelogContent({ en: "", "zh-CN": "   " })).toBe(false)
  })
})
