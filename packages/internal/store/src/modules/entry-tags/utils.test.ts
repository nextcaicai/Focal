import { describe, expect, test } from "vitest"

import {
  inferDomainFromTags,
  resolveTopicLabel,
  tagsNeedTaxonomyUpgrade,
  validateContentType,
  validateDomain,
  validateTagAssignments,
} from "./utils"

describe("validateTagAssignments", () => {
  test("keeps only current candidate labels and max 3 tags", () => {
    const result = validateTagAssignments({
      tags: [
        { label: "Agent 智能体", confidence: 0.9, reason: "Agent product" },
        { label: "Invalid", confidence: 0.8, reason: "Should be dropped" },
        { label: "编码与开发", confidence: 0.7, reason: "Code" },
        { label: "开源生态", confidence: 0.6, reason: "Open source" },
        { label: "多模态", confidence: 0.55, reason: "Vision" },
      ],
    })

    expect(result).toHaveLength(3)
    expect(result.map((tag) => tag.label)).toEqual(["Agent 智能体", "编码与开发", "开源生态"])
    expect(result[0]?.confidence).toBe(0.9)
  })

  test("maps legacy labels and drops unmapped legacy", () => {
    const result = validateTagAssignments({
      tags: [
        { label: "Agent", confidence: 0.9, reason: "legacy agent" },
        { label: "AI", confidence: 0.95, reason: "too broad" },
        { label: "编程", confidence: 0.8, reason: "coding" },
        { label: "论文", confidence: 0.9, reason: "paper is genre not topic" },
      ],
    })

    expect(result.map((tag) => tag.label)).toEqual(["Agent 智能体", "编码与开发"])
  })

  test("deduplicates labels, clamps confidence, drops low confidence", () => {
    const result = validateTagAssignments({
      tags: [
        { label: "Agent 智能体", confidence: 1.4, reason: "Agent workflow" },
        { label: "Agent 智能体", confidence: 0.2, reason: "Duplicate" },
        { label: "多模态", confidence: 0.4, reason: "too weak" },
      ],
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.confidence).toBe(1)
  })
})

describe("resolveTopicLabel", () => {
  test("maps legacy Agent to Agent 智能体", () => {
    expect(resolveTopicLabel("Agent")).toBe("Agent 智能体")
    expect(resolveTopicLabel("AI")).toBeNull()
  })
})

describe("validateContentType / validateDomain", () => {
  test("accepts 发布 and falls back low-confidence to 其他", () => {
    expect(validateContentType({ label: "发布", confidence: 0.9 })?.label).toBe("发布")
    expect(validateContentType({ label: "分析", confidence: 0.2 })?.label).toBe("其他")
  })

  test("accepts domains", () => {
    expect(validateDomain({ label: "设计与体验", confidence: 0.8 })?.label).toBe("设计与体验")
    expect(validateDomain({ label: "AI 与模型", confidence: 0.1 })?.label).toBe("其他")
  })
})

describe("inferDomainFromTags", () => {
  test("infers AI domain from technical topics", () => {
    expect(inferDomainFromTags([{ label: "推理能力" }])?.label).toBe("AI 与模型")
  })

  test("infers 人文与生活 from 创作与个人成长", () => {
    expect(inferDomainFromTags([{ label: "创作与个人成长" }])?.label).toBe("人文与生活")
  })

  test("infers from legacy flat tags", () => {
    expect(inferDomainFromTags([{ label: "设计" }])?.label).toBe("设计与体验")
  })
})

describe("tagsNeedTaxonomyUpgrade", () => {
  test("needs upgrade when version missing or domain missing", () => {
    expect(tagsNeedTaxonomyUpgrade([{ label: "Agent 智能体" }], null, true)).toBe(true)
    expect(tagsNeedTaxonomyUpgrade([{ label: "Agent 智能体" }], 1, false)).toBe(true)
  })

  test("empty tags at v1 are ok", () => {
    expect(tagsNeedTaxonomyUpgrade([], 1, true)).toBe(false)
  })
})
