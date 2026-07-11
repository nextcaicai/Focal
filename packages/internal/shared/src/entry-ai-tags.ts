/**
 * Entry taxonomy closed sets (A/B/C).
 * True sources for product wording: docs/topic-taxonomy-*-v1.md
 * Entity axis (D) is deferred — see docs/topic-taxonomy-entity-deferred.md
 */

/** Bump when closed sets change in a way that requires re-enrichment. */
export const ENTRY_TAXONOMY_VERSION = 1

// ---------------------------------------------------------------------------
// Axis C — topic / 议题主题 (multi, max MAX_ENTRY_AI_TAGS)
// ---------------------------------------------------------------------------

export const ENTRY_AI_TAG_CANDIDATES = [
  // C1 technical
  "大模型基础",
  "推理能力",
  "Agent 智能体",
  "编码与开发",
  "多模态",
  "图像生成",
  "视频生成",
  "语音与音频",
  "具身智能",
  "端侧与本地",
  "开源生态",
  "数据与训练",
  "部署与推理工程",
  "安全与对齐",
  "检索与 RAG",
  "工具与 MCP",
  "评测与基准",
  // C2 product/app (coarse)
  "应用与落地",
  // C3 business / people / creator (coarse, not AI-tech leaves)
  "商业与产业",
  "监管与政策",
  "人物与访谈",
  "创作与个人成长",
] as const

export type EntryAiTagLabel = (typeof ENTRY_AI_TAG_CANDIDATES)[number]

export const MAX_ENTRY_AI_TAGS = 3

/** Drop topic tags below this confidence (docs: 准且稳). */
export const MIN_ENTRY_AI_TAG_CONFIDENCE = 0.55

export type EntryAiTagAssignment = {
  label: EntryAiTagLabel
  confidence: number
  reason: string
}

/**
 * Map pre-v1 flat tags → new C labels (null = drop from C; may inform domain/genre elsewhere).
 */
export const LEGACY_ENTRY_AI_TAG_MAP: Readonly<Record<string, EntryAiTagLabel | null>> = {
  AI: null,
  产品: "应用与落地",
  行业: "商业与产业",
  技巧: null,
  论文: null,
  编程: "编码与开发",
  Agent: "Agent 智能体",
  设计: null,
  创业: "商业与产业",
  商业: "商业与产业",
}

// ---------------------------------------------------------------------------
// Axis A — content type / 形态 (single)
// ---------------------------------------------------------------------------

export const ENTRY_CONTENT_TYPE_CANDIDATES = [
  "快讯",
  "发布",
  "合集",
  "教程",
  "实测",
  "分析",
  "观点",
  "论文",
  "其他",
] as const

export type EntryContentType = (typeof ENTRY_CONTENT_TYPE_CANDIDATES)[number]

export const DEFAULT_ENTRY_CONTENT_TYPE: EntryContentType = "其他"

export type EntryContentTypeAssignment = {
  label: EntryContentType
  confidence: number
}

// ---------------------------------------------------------------------------
// Axis B — domain / 领域 (single)
// ---------------------------------------------------------------------------

export const ENTRY_DOMAIN_CANDIDATES = [
  "AI 与模型",
  "产品与工程",
  "商业与产业",
  "设计与体验",
  "人文与生活",
  "社会与政策",
  "其他",
] as const

export type EntryDomain = (typeof ENTRY_DOMAIN_CANDIDATES)[number]

export const DEFAULT_ENTRY_DOMAIN: EntryDomain = "其他"

export type EntryDomainAssignment = {
  label: EntryDomain
  confidence: number
}

/** Infer a coarse domain from legacy flat tags when domain was never stored. */
export const LEGACY_TAG_TO_DOMAIN: Readonly<Record<string, EntryDomain>> = {
  AI: "AI 与模型",
  Agent: "AI 与模型",
  论文: "AI 与模型",
  编程: "产品与工程",
  产品: "产品与工程",
  技巧: "产品与工程",
  设计: "设计与体验",
  行业: "商业与产业",
  创业: "商业与产业",
  商业: "商业与产业",
}
