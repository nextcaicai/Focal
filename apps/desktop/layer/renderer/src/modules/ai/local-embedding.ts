import { getEmbeddingProviderPreset } from "@follow/shared/embedding-provider"
import type { EntryEmbeddingRecord } from "@follow/shared/entry-embedding"
import type { EmbeddingBatchGenerator, EmbeddingGenerator } from "@follow/store/context"
import { parseEmbeddingApiVectors } from "@follow/store/entry-embedding/embedding-api-response"

import { getAISettings } from "~/atoms/settings/ai"

import { requestOpenAICompatibleEmbedding } from "./local-byok-request"

const normalizeOpenAIBaseURL = (baseURL: string) => baseURL.replace(/\/+$/, "")

type EmbeddingProviderConfig = {
  apiKey: string
  baseURL: string
  model: string
  dimension: number
  preset: EntryEmbeddingRecord["preset"]
}

const resolveEmbeddingProviderConfig = (): EmbeddingProviderConfig | null => {
  const embeddingSettings = getAISettings().embedding
  if (!embeddingSettings?.enabled || !embeddingSettings.provider) {
    return null
  }

  const { provider } = embeddingSettings
  const apiKey = provider.apiKey?.trim()
  if (!apiKey) return null

  const preset = getEmbeddingProviderPreset(provider.preset)
  const baseURL = normalizeOpenAIBaseURL(provider.baseURL || preset?.defaultBaseURL || "")
  const model = provider.model || preset?.defaultModel
  if (!baseURL || !model) return null

  return {
    apiKey,
    baseURL,
    model,
    dimension: provider.dimension ?? preset?.dimension ?? 0,
    preset: provider.preset,
  }
}

const buildEmbeddingRecord = (
  vector: number[],
  config: EmbeddingProviderConfig,
): EntryEmbeddingRecord | null => {
  const dimension = config.dimension > 0 ? config.dimension : vector.length
  if (dimension > 0 && vector.length !== dimension) {
    console.warn(`[embedding] Dimension mismatch: expected ${dimension}, received ${vector.length}`)
    return null
  }

  return {
    preset: config.preset,
    provider: config.preset,
    model: config.model,
    dimension,
    vector,
    embedded_at: new Date().toISOString(),
  }
}

export const embedTextsWithLocalProvider = async (
  texts: string[],
): Promise<Array<EntryEmbeddingRecord | null>> => {
  if (texts.length === 0) return []

  const config = resolveEmbeddingProviderConfig()
  if (!config) return texts.map(() => null)

  const payload = await requestOpenAICompatibleEmbedding({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    body: {
      model: config.model,
      input: texts.length === 1 ? texts[0]! : texts,
    },
  })

  const vectors = parseEmbeddingApiVectors(payload.data, texts.length)
  return vectors.map((vector) => (vector ? buildEmbeddingRecord(vector, config) : null))
}

export const generateLocalEmbedding: EmbeddingGenerator = async ({ text }) => {
  const [record] = await embedTextsWithLocalProvider([text])
  return record ?? null
}

export const generateLocalEmbeddingsBatch: EmbeddingBatchGenerator = async (inputs) => {
  return embedTextsWithLocalProvider(inputs.map((input) => input.text))
}
