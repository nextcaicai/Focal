import { beforeEach, describe, expect, test, vi } from "vitest"

import { tagGeneratorContext } from "../../context"
import { useEntryStore } from "../entry/store"
import type { EntryModel } from "../entry/types"
import { entryAiTagsActions, entryAiTagsSyncService, useEntryAiTagsStore } from "./store"

const { getAllTagsMock, upsertTagsMock } = vi.hoisted(() => ({
  getAllTagsMock: vi.fn(),
  upsertTagsMock: vi.fn(),
}))

vi.mock("@follow/database/services/entry-ai-tags", () => ({
  entryAiTagsService: {
    getAllTags: getAllTagsMock,
    upsertTags: upsertTagsMock,
    reset: vi.fn(),
  },
}))

const createEntry = (id: string): EntryModel => ({
  id,
  guid: `${id}-guid`,
  insertedAt: new Date("2026-01-01T00:00:00.000Z"),
  publishedAt: new Date("2026-01-01T00:00:00.000Z"),
})

describe("legacy entry tag migration", () => {
  const entryId = "legacy-entry"

  beforeEach(() => {
    vi.clearAllMocks()
    upsertTagsMock.mockImplementation(async () => {})
    tagGeneratorContext.provide()
    useEntryAiTagsStore.setState({
      data: {},
      sourceData: {},
      contentType: {},
      domain: {},
      taxonomyVersion: {},
    })
    useEntryStore.setState({ data: { [entryId]: createEntry(entryId) } })
  })

  test("upgrades a broad legacy tag offline even when it has no v1 topic mapping", async () => {
    getAllTagsMock.mockResolvedValue([
      {
        entryId,
        tags: [{ label: "AI", confidence: 0.9, reason: "legacy tag" }],
        contentType: null,
        contentTypeConfidence: null,
        domain: null,
        domainConfidence: null,
        taxonomyVersion: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ])
    const generator = vi.fn().mockRejectedValue(new Error("LLM must not be called"))
    tagGeneratorContext.provide(generator)

    await entryAiTagsActions.hydrate()

    await expect(
      entryAiTagsSyncService.generateTags({ entryId, actionLanguage: "en" }),
    ).resolves.toEqual([])
    expect(generator).not.toHaveBeenCalled()
    expect(upsertTagsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId,
        tags: [],
        domain: "AI 与模型",
        taxonomyVersion: 1,
      }),
    )
  })

  test("does not overwrite an unrecognized legacy tag payload", async () => {
    getAllTagsMock.mockResolvedValue([
      {
        entryId,
        tags: [{ label: "自定义旧标签", confidence: 0.9, reason: "unknown legacy data" }],
        contentType: null,
        contentTypeConfidence: null,
        domain: null,
        domainConfidence: null,
        taxonomyVersion: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ])
    const generator = vi.fn().mockRejectedValue(new Error("LLM must not be called"))
    tagGeneratorContext.provide(generator)

    await entryAiTagsActions.hydrate()

    await expect(
      entryAiTagsSyncService.generateTags({ entryId, actionLanguage: "en" }),
    ).resolves.toEqual([])
    expect(generator).not.toHaveBeenCalled()
    expect(upsertTagsMock).not.toHaveBeenCalled()
  })

  test("preserves a legacy tag below the new generation confidence threshold", async () => {
    getAllTagsMock.mockResolvedValue([
      {
        entryId,
        tags: [{ label: "Agent", confidence: 0.4, reason: "valid legacy tag" }],
        contentType: null,
        contentTypeConfidence: null,
        domain: null,
        domainConfidence: null,
        taxonomyVersion: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ])

    await entryAiTagsActions.hydrate()
    await entryAiTagsSyncService.generateTags({ entryId, actionLanguage: "en" })

    expect(upsertTagsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: [{ label: "Agent 智能体", confidence: 0.4, reason: "valid legacy tag" }],
      }),
    )
  })

  test("keeps the previous in-memory tags when persistence fails", async () => {
    useEntryAiTagsStore.setState({
      data: {
        [entryId]: [{ label: "编码与开发", confidence: 0.8, reason: "previous" }],
      },
      sourceData: {
        [entryId]: [{ label: "编码与开发", confidence: 0.8, reason: "previous" }],
      },
      contentType: {
        [entryId]: { label: "教程", confidence: 0.8 },
      },
      domain: {
        [entryId]: { label: "产品与工程", confidence: 0.8 },
      },
      taxonomyVersion: {},
    })
    upsertTagsMock.mockRejectedValue(new Error("disk write failed"))

    await expect(
      entryAiTagsActions.upsertMany([
        {
          entryId,
          tags: [{ label: "Agent 智能体", confidence: 0.9, reason: "replacement" }],
          contentType: { label: "分析", confidence: 0.9 },
          domain: { label: "AI 与模型", confidence: 0.9 },
          taxonomyVersion: 1,
        },
      ]),
    ).rejects.toThrow("disk write failed")

    expect(useEntryAiTagsStore.getState()).toEqual({
      data: {
        [entryId]: [{ label: "编码与开发", confidence: 0.8, reason: "previous" }],
      },
      sourceData: {
        [entryId]: [{ label: "编码与开发", confidence: 0.8, reason: "previous" }],
      },
      contentType: {
        [entryId]: { label: "教程", confidence: 0.8 },
      },
      domain: {
        [entryId]: { label: "产品与工程", confidence: 0.8 },
      },
      taxonomyVersion: {},
    })
  })
})
