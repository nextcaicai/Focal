import { describe, expect, test } from "vitest"

import type { TranslationDocumentDraft } from "../../context"
import { assembleTranslationDraft, cloneTranslationDraft, hasTranslatedBlock } from "./document"

describe("translation document", () => {
  const draft: TranslationDocumentDraft = {
    entryId: "entry-1",
    target: "content",
    blockOrder: ["b1", "b2"],
    blocks: {
      b1: {
        id: "b1",
        kind: "paragraph",
        translatable: true,
        source: { html: "<p>Hello</p>", text: "Hello" },
        translated: { html: "<p>你好</p>" },
      },
      b2: {
        id: "b2",
        kind: "paragraph",
        translatable: true,
        source: { html: "<p>World</p>", text: "World" },
      },
    },
  }

  test("assembles translation with source fallback", () => {
    expect(assembleTranslationDraft(draft, "translation-only")).toBe("<p>你好</p>\n<p>World</p>")
    expect(assembleTranslationDraft(draft, "source-only")).toBe("<p>Hello</p>\n<p>World</p>")
    expect(hasTranslatedBlock(draft)).toBe(true)
  })

  test("clones nested block data", () => {
    const cloned = cloneTranslationDraft(draft)
    cloned.blocks.b1!.translated!.html = "<p>Changed</p>"

    expect(draft.blocks.b1?.translated?.html).toBe("<p>你好</p>")
  })
})
