import { describe, expect, test } from "vitest"

import { createAuthRequestOriginHeaders, createBuildSafeHeaders } from "./headers"

describe("createAuthRequestOriginHeaders", () => {
  test("uses the web origin for auth requests", () => {
    expect(createAuthRequestOriginHeaders("http://127.0.0.1/login?from=desktop")).toEqual({
      Origin: "http://127.0.0.1",
      Referer: "http://127.0.0.1",
    })
  })

  test("returns empty headers for invalid urls", () => {
    expect(createAuthRequestOriginHeaders("not-a-url")).toEqual({})
  })
})

describe("createBuildSafeHeaders", () => {
  test("replaces legacy internal app origin with the target url origin", () => {
    const buildSafeHeaders = createBuildSafeHeaders("https://web.focal.local", [])

    expect(
      buildSafeHeaders({
        headers: {
          Origin: "app://folo.is",
          Referer: "app://folo.is",
        },
        url: "https://example.com/image.png",
      }),
    ).toEqual({
      Origin: "https://example.com",
      Referer: "https://example.com",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    })
  })

  test("replaces focal internal app origin with the target url origin", () => {
    const buildSafeHeaders = createBuildSafeHeaders("https://web.focal.local", [])

    expect(
      buildSafeHeaders({
        headers: {
          Origin: "app://focal.local",
          Referer: "app://focal.local",
        },
        url: "https://example.com/image.png",
      }),
    ).toEqual({
      Origin: "https://example.com",
      Referer: "https://example.com",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    })
  })

  test("keeps explicit external referer headers", () => {
    const buildSafeHeaders = createBuildSafeHeaders("https://web.focal.local", [])

    expect(
      buildSafeHeaders({
        headers: {
          Origin: "https://source.example",
          Referer: "https://source.example",
        },
        url: "https://example.com/image.png",
      }),
    ).toEqual({
      Origin: "https://source.example",
      Referer: "https://source.example",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    })
  })
})
