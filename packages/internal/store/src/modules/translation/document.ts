import type { TranslationDocumentDraft } from "../../context"

export type TranslationDraftRenderMode = "source-only" | "translation-only" | "bilingual"

export const cloneTranslationDraft = (
  draft: TranslationDocumentDraft,
): TranslationDocumentDraft => ({
  ...draft,
  blockOrder: [...draft.blockOrder],
  blocks: Object.fromEntries(
    Object.entries(draft.blocks).map(([id, block]) => [
      id,
      {
        ...block,
        source: { ...block.source },
        translated: block.translated ? { ...block.translated } : undefined,
      },
    ]),
  ),
})

export const assembleTranslationDraft = (
  draft: TranslationDocumentDraft,
  mode: TranslationDraftRenderMode = "translation-only",
) => {
  const htmlBlocks = draft.blockOrder.map((id) => {
    const block = draft.blocks[id]
    if (!block) return ""

    const translatedHtml = block.translated?.html
    if (mode === "source-only" || !translatedHtml) {
      return block.source.html
    }

    if (mode === "bilingual") {
      return `${block.source.html}\n${translatedHtml}`
    }

    return translatedHtml
  })

  return htmlBlocks.filter(Boolean).join("\n")
}

export const hasTranslatedBlock = (draft: TranslationDocumentDraft) =>
  draft.blockOrder.some((id) => !!draft.blocks[id]?.translated?.html)
