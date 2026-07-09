import { describe, expect, test } from "vitest"

import { TranslationSegmentStreamParser } from "./translation-stream"

describe("TranslationSegmentStreamParser", () => {
  test("emits complete segments across streamed chunks", () => {
    const parser = new TranslationSegmentStreamParser()

    expect(parser.push('<t id="b1"><p>你')).toEqual([])
    expect(parser.push("好</p></t><t id='b2'>世界</t>")).toEqual([
      { id: "b1", html: "<p>你好</p>" },
      { id: "b2", html: "世界" },
    ])
  })

  test("dedupes repeated segment ids", () => {
    const parser = new TranslationSegmentStreamParser()

    expect(parser.push('<t id="b1">first</t><t id="b1">second</t>')).toEqual([
      { id: "b1", html: "first" },
    ])
  })
})
