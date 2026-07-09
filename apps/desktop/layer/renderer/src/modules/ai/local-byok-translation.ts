import type { SupportedActionLanguage } from "@follow/shared/language"
import { ACTION_LANGUAGE_MAP } from "@follow/shared/language"
import type {
  TranslationBlockPair,
  TranslationGenerator,
  TranslationGeneratorContentDraftEvent,
  TranslationGeneratorContentField,
  TranslationGeneratorField,
  TranslationGeneratorResult,
} from "@follow/store/context"
import {
  assembleTranslationDraft,
  cloneTranslationDraft,
  hasTranslatedBlock,
} from "@follow/store/translation/document"

import { getAISettings } from "~/atoms/settings/ai"
import {
  getProviderOption,
  getSafeTemperature,
  resolveConfiguredByokProvider,
} from "~/modules/settings/tabs/ai/byok/constants"

import {
  requestOpenAICompatibleChatCompletion,
  requestOpenAICompatibleChatCompletionStream,
} from "./local-byok-request"
import {
  createTranslationBlockBatches,
  createTranslationDocumentDraft,
  getTranslatableBlocks,
} from "./translation-blocks"
import { TranslationSegmentStreamParser } from "./translation-stream"

const MAX_TRANSLATION_SOURCE_LENGTH = 24_000

const translationContentFields = new Set<TranslationGeneratorField>([
  "content",
  "readabilityContent",
])
const isTranslationContentField = (
  field: TranslationGeneratorField,
): field is TranslationGeneratorContentField => translationContentFields.has(field)

const getFieldInstruction = (field: TranslationGeneratorField) => {
  switch (field) {
    case "title": {
      return "Translate the title only. Keep product names, abbreviations, and proper nouns in their original language when natural."
    }
    case "description": {
      return "Translate the description. Keep product names, abbreviations, and proper nouns in their original language when natural."
    }
    case "content":
    case "readabilityContent": {
      return "Translate the content. Preserve all HTML tags and structure. Only translate human-readable text. Keep product names, abbreviations, and proper nouns in their original language when natural."
    }
    default: {
      return "Translate the text. Keep proper nouns in their original language when natural."
    }
  }
}

const resolveByokProvider = () => {
  // For automatic enrichment, always use the BYOK provider currently configured in Settings.
  const resolvedProvider = resolveConfiguredByokProvider(getAISettings().byok)

  if (!resolvedProvider) {
    throw new Error(
      "No OpenAI-compatible BYOK provider is configured. Enable BYOK and add a provider in Settings > AI.",
    )
  }

  const providerOption = getProviderOption(resolvedProvider.provider.provider)
  if (!providerOption) {
    throw new Error("The selected BYOK provider is not supported.")
  }

  return resolvedProvider
}

const requestByokTranslation = async ({
  source,
  field,
  actionLanguage,
}: {
  source: string
  field: TranslationGeneratorField
  actionLanguage: SupportedActionLanguage
}) => {
  const resolvedProvider = resolveByokProvider()
  const languageLabel = ACTION_LANGUAGE_MAP[actionLanguage]?.label || actionLanguage
  const data = await requestOpenAICompatibleChatCompletion({
    baseURL: resolvedProvider.baseURL,
    apiKey: resolvedProvider.apiKey ?? undefined,
    headers: resolvedProvider.provider.headers,
    body: {
      model: resolvedProvider.model,
      messages: [
        {
          role: "system",
          content:
            "You translate RSS reader content. Return only the translated result without explanations or quotes.",
        },
        {
          role: "user",
          content: `${getFieldInstruction(field)} Translate into ${languageLabel}.\n\n${source.slice(0, MAX_TRANSLATION_SOURCE_LENGTH)}`,
        },
      ],
      temperature: getSafeTemperature(resolvedProvider.provider.provider, 0.2),
      stream: false,
    },
  })
  return data.choices?.[0]?.message?.content?.trim() || null
}

const buildTranslationBatchPrompt = ({
  blocks,
  field,
  languageLabel,
}: {
  blocks: readonly TranslationBlockPair[]
  field: TranslationGeneratorContentField
  languageLabel: string
}) => {
  const blockPayload = blocks
    .map((block) => `<t id="${block.id}">\n${block.source.html}\n</t>`)
    .join("\n\n")

  return `${getFieldInstruction(field)}

Translate the following HTML blocks into ${languageLabel}.

Rules:
- Return only translated segments in this exact format: <t id="BLOCK_ID">translated HTML</t>.
- Keep the same ids. Do not add, remove, or reorder ids.
- Preserve HTML tags, attributes, links, images, inline code, and entities.
- Translate only human-readable text.
- Do not wrap the answer in Markdown or explanations.

${blockPayload}`
}

const requestByokTranslationDocument = async ({
  entryId,
  source,
  field,
  actionLanguage,
  onContentDraft,
}: {
  entryId: string
  source: string
  field: TranslationGeneratorContentField
  actionLanguage: SupportedActionLanguage
  onContentDraft?: (event: TranslationGeneratorContentDraftEvent) => void
}) => {
  const draft = createTranslationDocumentDraft({
    entryId,
    target: field,
    source,
  })
  const translatableBlocks = getTranslatableBlocks(draft)
  if (translatableBlocks.length === 0) return null

  const resolvedProvider = resolveByokProvider()
  const languageLabel = ACTION_LANGUAGE_MAP[actionLanguage]?.label || actionLanguage
  const batches = createTranslationBlockBatches(translatableBlocks, MAX_TRANSLATION_SOURCE_LENGTH)
  const emitDraft = () => {
    onContentDraft?.({
      field,
      draft: cloneTranslationDraft(draft),
      content: assembleTranslationDraft(draft, "translation-only"),
    })
  }

  try {
    for (const batch of batches) {
      const parser = new TranslationSegmentStreamParser()
      const prompt = buildTranslationBatchPrompt({
        blocks: batch,
        field,
        languageLabel,
      })

      for await (const delta of requestOpenAICompatibleChatCompletionStream({
        baseURL: resolvedProvider.baseURL,
        apiKey: resolvedProvider.apiKey ?? undefined,
        headers: resolvedProvider.provider.headers,
        body: {
          model: resolvedProvider.model,
          messages: [
            {
              role: "system",
              content:
                "You translate RSS reader content. Return only id-tagged translated HTML segments.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: getSafeTemperature(resolvedProvider.provider.provider, 0.2),
          stream: true,
        },
      })) {
        const segments = parser.push(delta)
        for (const segment of segments) {
          const block = draft.blocks[segment.id]
          if (!block?.translatable) continue

          block.translated = {
            html: segment.html,
          }
          emitDraft()
        }
      }
    }

    return hasTranslatedBlock(draft) ? assembleTranslationDraft(draft, "translation-only") : null
  } catch (error) {
    console.warn("Streaming BYOK translation failed, falling back to non-streaming request.", error)
    return requestByokTranslation({
      source,
      field,
      actionLanguage,
    })
  }
}

export const generateLocalByokTranslation: TranslationGenerator = async (input) => {
  const results: TranslationGeneratorResult = {}

  for (const field of input.fields) {
    const source = input.entry[field]
    if (!source?.trim()) continue

    const translated = isTranslationContentField(field)
      ? await requestByokTranslationDocument({
          entryId: input.entryId,
          source,
          field,
          actionLanguage: input.actionLanguage,
          onContentDraft: input.onContentDraft,
        })
      : await requestByokTranslation({
          source,
          field,
          actionLanguage: input.actionLanguage,
        })

    if (translated) {
      results[field] = translated
    }
  }

  return results
}
