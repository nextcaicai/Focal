import { assembleTranslationDraft } from "@follow/store/translation/document"
import { describe, expect, test } from "vitest"

import {
  createTranslationBlockBatches,
  createTranslationDocumentDraft,
  getTranslatableBlocks,
} from "./translation-blocks"

describe("translation blocks", () => {
  test("keeps source and translated blocks separable", () => {
    const draft = createTranslationDocumentDraft({
      entryId: "entry-1",
      target: "content",
      source: "<article><h2>Hello</h2><p>World</p><pre><code>const a = 1</code></pre></article>",
    })

    expect(draft.blockOrder).toEqual(["b1", "b2", "b3"])
    expect(draft.blocks.b1?.kind).toBe("heading")
    expect(draft.blocks.b2?.source.text).toBe("World")
    expect(draft.blocks.b3?.translatable).toBe(false)

    draft.blocks.b1!.translated = { html: "<h2>你好</h2>" }

    expect(assembleTranslationDraft(draft, "translation-only")).toContain("<h2>你好</h2>")
    expect(assembleTranslationDraft(draft, "translation-only")).toContain("<p>World</p>")
    expect(assembleTranslationDraft(draft, "source-only")).toContain("<h2>Hello</h2>")
  })

  test("batches translatable blocks by source length", () => {
    const draft = createTranslationDocumentDraft({
      entryId: "entry-1",
      target: "content",
      source: '<p>First paragraph</p><p>Second paragraph</p><img src="x.png">',
    })

    const batches = createTranslationBlockBatches(getTranslatableBlocks(draft), 40)

    expect(batches).toHaveLength(2)
    expect(batches[0]?.map((block) => block.id)).toEqual(["b1"])
    expect(batches[1]?.map((block) => block.id)).toEqual(["b2"])
  })
})
