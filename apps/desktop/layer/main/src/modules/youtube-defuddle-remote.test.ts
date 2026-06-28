import { describe, expect, it } from "vitest"

import { parseDefuddleMdResponse } from "./youtube-defuddle-remote"

describe("parseDefuddleMdResponse", () => {
  it("extracts YAML frontmatter title and markdown body", () => {
    const parsed = parseDefuddleMdResponse(`---
title: "Codex 从 0 到 1 全攻略"
site: "YouTube"
source: "https://www.youtube.com/watch?v=HQGUed-e2wM"
---

![](https://www.youtube.com/watch?v=HQGUed-e2wM)

## Transcript

**0:00** · Hello
`)

    expect(parsed.title).toBe("Codex 从 0 到 1 全攻略")
    expect(parsed.content).toContain("## Transcript")
    expect(parsed.content).toContain("**0:00** · Hello")
  })
})
