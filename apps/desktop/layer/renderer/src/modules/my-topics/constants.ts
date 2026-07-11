import { getStorageNS } from "@follow/utils/ns"

import type { MyTopic } from "./types"

export const MY_TOPICS_STORAGE_KEY = getStorageNS("my-topics")

const seedTime = Date.now()

export const DEFAULT_MY_TOPICS: MyTopic[] = [
  {
    id: "seed-agent",
    name: "Agent 智能体",
    selector: { type: "aiTag", label: "Agent 智能体" },
    pinned: false,
    createdAt: seedTime,
    lastOpenedAt: seedTime,
  },
  {
    id: "seed-coding",
    name: "编码与开发",
    selector: { type: "aiTag", label: "编码与开发" },
    pinned: false,
    createdAt: seedTime,
    lastOpenedAt: seedTime,
  },
]
