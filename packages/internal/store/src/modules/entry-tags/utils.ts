import type {
  EntryAiTagAssignment,
  EntryAiTagLabel,
  EntryContentType,
  EntryContentTypeAssignment,
  EntryDomain,
  EntryDomainAssignment,
} from "@follow/shared/entry-ai-tags"
import {
  DEFAULT_ENTRY_CONTENT_TYPE,
  DEFAULT_ENTRY_DOMAIN,
  ENTRY_AI_TAG_CANDIDATES,
  ENTRY_CONTENT_TYPE_CANDIDATES,
  ENTRY_DOMAIN_CANDIDATES,
  LEGACY_ENTRY_AI_TAG_MAP,
  LEGACY_TAG_TO_DOMAIN,
  MAX_ENTRY_AI_TAGS,
  MIN_ENTRY_AI_TAG_CONFIDENCE,
} from "@follow/shared/entry-ai-tags"

const candidateSet = new Set<string>(ENTRY_AI_TAG_CANDIDATES)

const isEntryAiTagLabel = (label: string): label is EntryAiTagLabel => candidateSet.has(label)

const contentTypeSet = new Set<string>(ENTRY_CONTENT_TYPE_CANDIDATES)

const isEntryContentType = (label: string): label is EntryContentType => contentTypeSet.has(label)

const domainSet = new Set<string>(ENTRY_DOMAIN_CANDIDATES)

const isEntryDomain = (label: string): label is EntryDomain => domainSet.has(label)

const clampConfidence = (value: number) => Math.min(1, Math.max(0, value))

/** Resolve a raw label (including legacy flat tags) to a current C label or null. */
export const resolveTopicLabel = (raw: string): EntryAiTagLabel | null => {
  const label = raw.trim()
  if (!label) return null
  if (isEntryAiTagLabel(label)) return label
  if (label in LEGACY_ENTRY_AI_TAG_MAP) {
    return LEGACY_ENTRY_AI_TAG_MAP[label] ?? null
  }
  return null
}

export const validateContentType = (raw: unknown): EntryContentTypeAssignment | null => {
  if (!raw || typeof raw !== "object") return null

  const record = raw as Record<string, unknown>
  const label = typeof record.label === "string" ? record.label.trim() : ""
  if (!isEntryContentType(label)) return null

  const confidenceValue =
    typeof record.confidence === "number" ? record.confidence : Number(record.confidence)
  if (!Number.isFinite(confidenceValue)) return null

  const confidence = clampConfidence(confidenceValue)
  if (confidence < MIN_ENTRY_AI_TAG_CONFIDENCE && label !== DEFAULT_ENTRY_CONTENT_TYPE) {
    return { label: DEFAULT_ENTRY_CONTENT_TYPE, confidence }
  }

  return {
    label,
    confidence,
  }
}

export const validateDomain = (raw: unknown): EntryDomainAssignment | null => {
  if (!raw || typeof raw !== "object") return null

  const record = raw as Record<string, unknown>
  const label = typeof record.label === "string" ? record.label.trim() : ""
  if (!isEntryDomain(label)) return null

  const confidenceValue =
    typeof record.confidence === "number" ? record.confidence : Number(record.confidence)
  if (!Number.isFinite(confidenceValue)) return null

  const confidence = clampConfidence(confidenceValue)
  if (confidence < MIN_ENTRY_AI_TAG_CONFIDENCE && label !== DEFAULT_ENTRY_DOMAIN) {
    return { label: DEFAULT_ENTRY_DOMAIN, confidence }
  }

  return {
    label,
    confidence,
  }
}

/**
 * Infer domain from legacy topic tags when domain column is missing.
 * Prefer first mappable legacy/current signal; default 其他.
 */
export const inferDomainFromTags = (
  tags: Array<{ label: string }> | undefined,
): EntryDomainAssignment | null => {
  if (!tags?.length) return null

  for (const tag of tags) {
    const raw = tag.label.trim()
    if (isEntryDomain(raw)) {
      return { label: raw, confidence: 0.5 }
    }
    const fromLegacy = LEGACY_TAG_TO_DOMAIN[raw]
    if (fromLegacy) {
      return { label: fromLegacy, confidence: 0.45 }
    }
    // Coarse non-tech C buckets → domain (not AI 与模型)
    if (raw === "应用与落地") return { label: "产品与工程", confidence: 0.4 }
    if (raw === "商业与产业") return { label: "商业与产业", confidence: 0.4 }
    if (raw === "监管与政策") return { label: "社会与政策", confidence: 0.4 }
    if (raw === "人物与访谈" || raw === "创作与个人成长") {
      return { label: "人文与生活", confidence: 0.4 }
    }
    // Remaining closed-set C labels are technical → AI 与模型
    if (isEntryAiTagLabel(raw)) {
      return { label: "AI 与模型", confidence: 0.4 }
    }
  }

  return { label: DEFAULT_ENTRY_DOMAIN, confidence: 0.3 }
}

export const validateTagAssignments = (raw: unknown): EntryAiTagAssignment[] => {
  if (!raw || typeof raw !== "object") return []

  const tagsValue = "tags" in raw ? (raw as { tags: unknown }).tags : null
  if (!Array.isArray(tagsValue)) return []

  const seen = new Set<string>()
  const validated: EntryAiTagAssignment[] = []

  for (const item of tagsValue) {
    if (!item || typeof item !== "object") continue

    const record = item as Record<string, unknown>
    const rawLabel = typeof record.label === "string" ? record.label.trim() : ""
    const label = resolveTopicLabel(rawLabel)
    if (!label || seen.has(label)) continue

    const confidenceValue =
      typeof record.confidence === "number" ? record.confidence : Number(record.confidence)
    if (!Number.isFinite(confidenceValue)) continue

    const confidence = clampConfidence(confidenceValue)
    if (confidence < MIN_ENTRY_AI_TAG_CONFIDENCE) continue

    const reason = typeof record.reason === "string" ? record.reason.trim() : ""
    seen.add(label)
    validated.push({
      label,
      confidence,
      reason: reason || "Matched based on article content.",
    })
  }

  return validated.sort((a, b) => b.confidence - a.confidence).slice(0, MAX_ENTRY_AI_TAGS)
}

/** Whether stored tags look like pre-v1 flat taxonomy (need re-enrich or map). */
export const tagsNeedTaxonomyUpgrade = (
  tags: Array<{ label: string }> | undefined,
  taxonomyVersion: number | null | undefined,
  hasDomain: boolean,
): boolean => {
  if (taxonomyVersion == null || taxonomyVersion < 1) return true
  if (!hasDomain) return true
  if (!tags?.length) return false

  return tags.some((tag) => {
    const raw = tag.label.trim()
    if (isEntryAiTagLabel(raw)) return false
    // legacy key still stored unmapped
    return raw in LEGACY_ENTRY_AI_TAG_MAP
  })
}
