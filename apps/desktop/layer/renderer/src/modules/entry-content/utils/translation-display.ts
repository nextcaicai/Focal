import type {
  TranslationBlockPair,
  TranslationDocumentDraft,
  TranslationGeneratorContentField,
} from "@follow/store/context"
import { assembleTranslationDraft } from "@follow/store/translation/document"
import type { TranslationMode } from "@follow/store/translation/types"

import { createTranslationDocumentDraft } from "../../ai/translation-blocks"

export type TranslationDisplayMode = TranslationMode

export const getNextTranslationDisplayMode = (
  mode: TranslationDisplayMode,
): TranslationDisplayMode => (mode === "bilingual" ? "translation-only" : "bilingual")

const getBlocksByOrder = (draft: TranslationDocumentDraft) =>
  draft.blockOrder
    .map((id) => draft.blocks[id])
    .filter((block): block is TranslationBlockPair => !!block)

export const createBilingualDraftFromCachedContent = ({
  entryId,
  target,
  sourceContent,
  translatedContent,
}: {
  entryId: string
  target: TranslationGeneratorContentField
  sourceContent?: string | null
  translatedContent?: string | null
}): TranslationDocumentDraft | null => {
  if (!sourceContent || !translatedContent) return null

  const sourceDraft = createTranslationDocumentDraft({
    entryId,
    target,
    source: sourceContent,
  })
  const translatedDraft = createTranslationDocumentDraft({
    entryId,
    target,
    source: translatedContent,
  })
  const translatedBlocks = getBlocksByOrder(translatedDraft)

  const blocks = Object.fromEntries(
    sourceDraft.blockOrder.map((id, index) => {
      const sourceBlock = sourceDraft.blocks[id]!
      const translatedBlock = translatedBlocks[index]

      return [
        id,
        {
          ...sourceBlock,
          source: { ...sourceBlock.source },
          translated:
            sourceBlock.translatable && translatedBlock?.source.html
              ? { html: translatedBlock.source.html }
              : sourceBlock.translated
                ? { ...sourceBlock.translated }
                : undefined,
        },
      ]
    }),
  )

  return {
    ...sourceDraft,
    blocks,
  }
}

export const assembleTranslationDisplayContent = ({
  entryId,
  target,
  sourceContent,
  translatedContent,
  draft,
  mode,
}: {
  entryId: string
  target: TranslationGeneratorContentField
  sourceContent?: string | null
  translatedContent?: string | null
  draft?: TranslationDocumentDraft
  mode: TranslationDisplayMode
}) => {
  if (mode === "translation-only") {
    return translatedContent || sourceContent
  }

  if (draft) {
    return assembleTranslationDraft(draft, "bilingual")
  }

  const fallbackDraft = createBilingualDraftFromCachedContent({
    entryId,
    target,
    sourceContent,
    translatedContent,
  })

  if (fallbackDraft) {
    return assembleTranslationDraft(fallbackDraft, "bilingual")
  }

  return translatedContent || sourceContent
}
