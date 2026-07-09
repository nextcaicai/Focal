import type { SupportedActionLanguage } from "@follow/shared"
import { beforeEach, describe, expect, test, vi } from "vitest"

import type { TranslationDocumentDraft } from "../../context"
import { translationGeneratorContext } from "../../context"
import { useEntryStore } from "../entry/store"
import type { EntryModel } from "../entry/types"
import { translationActions, translationSyncService, useTranslationStore } from "./store"

const { insertTranslationMock, resetTranslationMock } = vi.hoisted(() => ({
  insertTranslationMock: vi.fn(),
  resetTranslationMock: vi.fn(),
}))

vi.mock("@follow/database/services/translation", () => ({
  TranslationService: {
    getTranslationToHydrate: vi.fn(),
    insertTranslation: insertTranslationMock,
    reset: resetTranslationMock,
  },
}))

const language = "zh-CN" as SupportedActionLanguage
const entryId = "entry-1"

const createEntry = (): EntryModel =>
  ({
    id: entryId,
    guid: `${entryId}-guid`,
    insertedAt: new Date("2026-01-01T00:00:00.000Z"),
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    content: "<p>Hello</p>",
  }) as EntryModel

const createDraft = (): TranslationDocumentDraft => ({
  entryId,
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
    vi.clearAllMocks()
    translationGeneratorContext.provide()
    useEntryStore.setState({
      data: {
        [entryId]: createEntry(),
      },
    })
    useTranslationStore.setState({ data: {}, drafts: {} })
  })

  test("upserts draft content into the existing translation data surface", () => {
    translationActions.upsertDraftInSession({
      entryId,
      language,
      field: "content",
      draft: createDraft(),
    })

    const state = useTranslationStore.getState()

    expect(state.data["entry-1"]?.[language]?.content).toBe("<p>你好</p>\n<p>World</p>")
    expect(state.drafts["entry-1"]?.[language]?.content?.blocks.b1?.source.text).toBe("Hello")
  })

  test("keeps content draft when final translation is upserted", () => {
    translationActions.upsertDraftInSession({
      entryId,
      language,
      field: "content",
      draft: createDraft(),
    })

    translationActions.upsertManyInSession([
      {
        entryId,
        language,
        title: null,
        description: null,
        content: "<p>Final</p>",
        readabilityContent: null,
      },
    ])

    const state = useTranslationStore.getState()

    expect(state.data[entryId]?.[language]?.content).toBe("<p>Final</p>")
    expect(state.drafts[entryId]?.[language]?.content?.blocks.b1?.translated?.html).toBe(
      "<p>你好</p>",
    )
  })

  test("keeps cached body translation when translation mode changes", async () => {
    const localGenerator = vi.fn().mockResolvedValue({ content: "<p>重新翻译</p>" })
    translationGeneratorContext.provide(localGenerator)
    translationActions.upsertManyInSession([
      {
        entryId,
        language,
        title: null,
        description: null,
        content: "<p>已翻译</p>",
        readabilityContent: null,
      },
    ])

    await expect(
      translationSyncService.generateTranslation({
        entryId,
        language,
        withContent: true,
        target: "content",
        mode: "bilingual",
        fields: ["content"],
      }),
    ).resolves.toMatchObject({ content: "<p>已翻译</p>" })

    await expect(
      translationSyncService.generateTranslation({
        entryId,
        language,
        withContent: true,
        target: "content",
        mode: "translation-only",
        fields: ["content"],
      }),
    ).resolves.toMatchObject({ content: "<p>已翻译</p>" })

    expect(localGenerator).not.toHaveBeenCalled()
    expect(resetTranslationMock).not.toHaveBeenCalled()
    expect(insertTranslationMock).not.toHaveBeenCalled()
    expect(useTranslationStore.getState().data[entryId]?.[language]?.content).toBe("<p>已翻译</p>")
  })
})
