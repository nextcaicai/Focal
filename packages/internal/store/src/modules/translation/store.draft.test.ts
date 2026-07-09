import type { SupportedActionLanguage } from "@follow/shared"
import { beforeEach, describe, expect, test } from "vitest"

import type { TranslationDocumentDraft } from "../../context"
import { translationActions, useTranslationStore } from "./store"

const language = "zh-CN" as SupportedActionLanguage

const createDraft = (): TranslationDocumentDraft => ({
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
})

describe("translation draft store", () => {
  beforeEach(() => {
    useTranslationStore.setState({ data: {}, drafts: {} })
  })

  test("upserts draft content into the existing translation data surface", () => {
    translationActions.upsertDraftInSession({
      entryId: "entry-1",
      language,
      field: "content",
      draft: createDraft(),
    })

    const state = useTranslationStore.getState()

    expect(state.data["entry-1"]?.[language]?.content).toBe("<p>你好</p>\n<p>World</p>")
    expect(state.drafts["entry-1"]?.[language]?.content?.blocks.b1?.source.text).toBe("Hello")
  })

  test("clears content draft when final translation is upserted", () => {
    translationActions.upsertDraftInSession({
      entryId: "entry-1",
      language,
      field: "content",
      draft: createDraft(),
    })

    translationActions.upsertManyInSession([
      {
        entryId: "entry-1",
        language,
        title: null,
        description: null,
        content: "<p>Final</p>",
        readabilityContent: null,
      },
    ])

    const state = useTranslationStore.getState()

    expect(state.data["entry-1"]?.[language]?.content).toBe("<p>Final</p>")
    expect(state.drafts["entry-1"]?.[language]?.content).toBeUndefined()
  })
})
