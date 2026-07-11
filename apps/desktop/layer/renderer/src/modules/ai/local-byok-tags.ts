import {
  ENTRY_AI_TAG_CANDIDATES,
  ENTRY_CONTENT_TYPE_CANDIDATES,
  ENTRY_DOMAIN_CANDIDATES,
  MAX_ENTRY_AI_TAGS,
} from "@follow/shared/entry-ai-tags"
import type { TagGenerator } from "@follow/store/context"

import { getAISettings } from "~/atoms/settings/ai"
import {
  getProviderOption,
  getSafeTemperature,
  resolveConfiguredByokProvider,
} from "~/modules/settings/tabs/ai/byok/constants"

import { requestOpenAICompatibleChatCompletion } from "./local-byok-request"

const MAX_TAG_SOURCE_LENGTH = 12_000

const htmlToText = (content: string) => {
  if (!content.trim()) return ""

  const parser = new DOMParser()
  const document = parser.parseFromString(content, "text/html")
  document.querySelectorAll("script, style, noscript").forEach((element) => element.remove())

  return (document.body.textContent || content).replaceAll(/\s+/g, " ").trim()
}

const buildTagSource = (input: Parameters<TagGenerator>[0]) => {
  const title = input.entry.title?.trim()
  const description = input.entry.description?.trim()
  const content = htmlToText(input.entry.content || "")

  return [
    title ? `Title: ${title}` : "",
    description ? `Description: ${description}` : "",
    input.summary ? `Summary: ${input.summary}` : "",
    content ? `Content: ${content.slice(0, MAX_TAG_SOURCE_LENGTH)}` : "",
    input.entry.url ? `URL: ${input.entry.url}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

const parseTagResponse = (raw: string) => {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    return JSON.parse(jsonMatch[0]) as unknown
  } catch {
    return null
  }
}

const parseLabeledConfidence = (
  parsed: object,
  key: "contentType" | "domain",
): { label: string; confidence: number } | null => {
  if (!(key in parsed)) return null

  const raw = (parsed as Record<string, unknown>)[key]
  if (!raw || typeof raw !== "object") return null

  const record = raw as Record<string, unknown>
  if (typeof record.label !== "string") return null

  const confidenceValue =
    typeof record.confidence === "number" ? record.confidence : Number(record.confidence)

  return {
    label: record.label,
    confidence: Number.isFinite(confidenceValue) ? confidenceValue : 0,
  }
}

export const generateLocalByokTags: TagGenerator = async (input) => {
  const source = buildTagSource(input)
  if (!source.trim()) {
    return { tags: [] }
  }

  // For automatic enrichment (summary/tags/score), always use the BYOK provider
  // currently configured in Settings, independent of the chat's selectedModel.
  const resolvedProvider = resolveConfiguredByokProvider(getAISettings().byok)

  if (!resolvedProvider) {
    throw new Error(
      "No OpenAI-compatible LLM provider is configured. Enable the LLM model and add a provider in Settings > AI.",
    )
  }

  const providerOption = getProviderOption(resolvedProvider.provider.provider)
  if (!providerOption) {
    throw new Error("The selected LLM provider is not supported.")
  }

  const topicLabels = ENTRY_AI_TAG_CANDIDATES.join("、")
  const contentTypeLabels = ENTRY_CONTENT_TYPE_CANDIDATES.join("、")
  const domainLabels = ENTRY_DOMAIN_CANDIDATES.join("、")
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
            "You classify RSS reader entries on three closed axes. Return JSON only. Never invent labels outside the allowed lists.",
        },
        {
          role: "user",
          content: `Classify this entry on three orthogonal axes.

Axis A — contentType (genre / how it is written), exactly ONE from: ${contentTypeLabels}.
- 快讯: short factual news of a single event
- 发布: official product/model/feature release or changelog
- 合集: digest/roundup of many items (daily/weekly)
- 教程: how-to / step-by-step
- 实测: hands-on test/review with results
- 分析: in-depth explanation of why/how
- 观点: opinion, commentary, interview voice
- 论文: academic paper or preprint-style research writing
- 其他: none clearly fits

Axis B — domain (which world it sits in), exactly ONE from: ${domainLabels}.
- AI 与模型: models, algorithms, capabilities, training/inference science
- 产品与工程: building/shipping products, tools, engineering practice
- 商业与产业: funding, markets, competition, commercialization
- 设计与体验: UX/UI, design systems, experience
- 人文与生活: culture, lifestyle, non-hard-tech humanistic pieces
- 社会与政策: law, regulation, public governance
- 其他: unclear or multi-topic digest with no main domain

Axis C — topic tags, 0 to ${MAX_ENTRY_AI_TAGS} labels from: ${topicLabels}.
- Prefer fewer high-confidence tags
- Empty tags is OK only when truly no closed-set fit (not when 创作与个人成长 / 人物与访谈 fits)
- 创作与个人成长: creator craft, writing/podcasting practice, career transition, self-improvement narratives (not pure model tech)
- Do NOT use domain or genre words as topic tags
- "论文" is contentType only, not a topic tag

Return JSON:
{"contentType":{"label":"分析","confidence":0.8},"domain":{"label":"AI 与模型","confidence":0.85},"tags":[{"label":"Agent 智能体","confidence":0.86,"reason":"一句话说明为什么选这个标签"}]}

Rules:
- Every label must exactly match an allowed string (full-width spaces and wording included)
- confidence in [0,1]; prefer confidence ≥ 0.55 or omit the topic tag
- reason: one short Chinese sentence, do not copy the summary verbatim
- pick 其他 for A or B when unsure

Entry:
${source}`,
        },
      ],
      temperature: getSafeTemperature(resolvedProvider.provider.provider, 0.1),
      stream: false,
    },
  })
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) {
    return { tags: [] }
  }

  const parsed = parseTagResponse(content)
  if (!parsed || typeof parsed !== "object") {
    return { tags: [] }
  }

  const tagsRaw =
    "tags" in parsed && Array.isArray((parsed as { tags: unknown }).tags)
      ? (parsed as { tags: unknown[] }).tags
      : []

  return {
    tags: tagsRaw
      .filter((tag): tag is { label: string; confidence: number; reason: string } => {
        return (
          !!tag &&
          typeof tag === "object" &&
          typeof (tag as { label?: unknown }).label === "string" &&
          typeof (tag as { confidence?: unknown }).confidence === "number" &&
          typeof (tag as { reason?: unknown }).reason === "string"
        )
      })
      .map((tag) => ({
        label: tag.label,
        confidence: tag.confidence,
        reason: tag.reason,
      })),
    contentType: parseLabeledConfidence(parsed, "contentType"),
    domain: parseLabeledConfidence(parsed, "domain"),
  }
}
