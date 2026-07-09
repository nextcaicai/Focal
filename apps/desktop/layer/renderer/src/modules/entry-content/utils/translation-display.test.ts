import { describe, expect, test } from "vitest"

import { assembleTranslationDisplayContent } from "./translation-display"

describe("translation display content", () => {
  test("assembles bilingual content from cached source and translated html", () => {
    expect(
      assembleTranslationDisplayContent({
        entryId: "entry-1",
        target: "content",
        sourceContent: "<p>Hello</p><p>World</p>",
        translatedContent: "<p>你好</p><p>世界</p>",
        mode: "bilingual",
      }),
    ).toBe("<p>Hello</p>\n<p>你好</p>\n<p>World</p>\n<p>世界</p>")
  })

  test("uses translated content directly in translation-only mode", () => {
    expect(
      assembleTranslationDisplayContent({
        entryId: "entry-1",
        target: "content",
        sourceContent: "<p>Hello</p>",
        translatedContent: "<p>你好</p>",
        mode: "translation-only",
      }),
    ).toBe("<p>你好</p>")
  })
})
