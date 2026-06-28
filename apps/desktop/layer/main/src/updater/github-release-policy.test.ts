import { describe, expect, it } from "vitest"

import {
  buildDesktopPolicyFromRelease,
  isVersionLessThan,
  resolveReleaseDownloadUrl,
} from "./github-release-policy"

const sampleRelease = {
  tag_name: "v0.1.9",
  html_url: "https://github.com/nextcaicai/Focal/releases/tag/v0.1.9",
  published_at: "2026-06-28T12:00:00.000Z",
  assets: [
    {
      name: "Focal-0.1.9-darwin-arm64.dmg",
      browser_download_url:
        "https://github.com/nextcaicai/Focal/releases/download/v0.1.9/Focal-0.1.9-darwin-arm64.dmg",
    },
    {
      name: "Focal-0.1.9-darwin-x64.dmg",
      browser_download_url:
        "https://github.com/nextcaicai/Focal/releases/download/v0.1.9/Focal-0.1.9-darwin-x64.dmg",
    },
    {
      name: "Focal-0.1.9-win32-x64.exe",
      browser_download_url:
        "https://github.com/nextcaicai/Focal/releases/download/v0.1.9/Focal-0.1.9-win32-x64.exe",
    },
  ],
}

describe("isVersionLessThan", () => {
  it("detects older semantic versions", () => {
    expect(isVersionLessThan("0.1.7", "0.1.8")).toBe(true)
    expect(isVersionLessThan("0.1.8", "0.1.8")).toBe(false)
    expect(isVersionLessThan("0.1.9", "0.1.8")).toBe(false)
    expect(isVersionLessThan("v0.1.7-beta.1", "0.1.8")).toBe(true)
  })
})

describe("resolveReleaseDownloadUrl", () => {
  it("prefers the matching macOS architecture asset", () => {
    expect(resolveReleaseDownloadUrl(sampleRelease, "desktop/macos/dmg", "arm64")).toBe(
      "https://github.com/nextcaicai/Focal/releases/download/v0.1.9/Focal-0.1.9-darwin-arm64.dmg",
    )
  })

  it("prefers the windows executable asset", () => {
    expect(resolveReleaseDownloadUrl(sampleRelease, "desktop/windows/exe", "x64")).toBe(
      "https://github.com/nextcaicai/Focal/releases/download/v0.1.9/Focal-0.1.9-win32-x64.exe",
    )
  })

  it("falls back to the release page when no asset matches", () => {
    expect(
      resolveReleaseDownloadUrl({ ...sampleRelease, assets: [] }, "desktop/macos/dmg", "arm64"),
    ).toBe(sampleRelease.html_url)
  })
})

describe("buildDesktopPolicyFromRelease", () => {
  it("returns a prompt policy for older desktop builds", () => {
    expect(
      buildDesktopPolicyFromRelease({
        currentVersion: "0.1.7",
        platform: "desktop/macos/dmg",
        release: sampleRelease,
        arch: "arm64",
      }),
    ).toEqual({
      action: "prompt",
      targetVersion: "0.1.9",
      message: "发现新版本，请下载安装。",
      distribution: "direct",
      downloadUrl:
        "https://github.com/nextcaicai/Focal/releases/download/v0.1.9/Focal-0.1.9-darwin-arm64.dmg",
      storeUrl: null,
      publishedAt: "2026-06-28T12:00:00.000Z",
    })
  })

  it("returns no update for current desktop builds", () => {
    expect(
      buildDesktopPolicyFromRelease({
        currentVersion: "0.1.9",
        platform: "desktop/macos/dmg",
        release: sampleRelease,
        arch: "arm64",
      }),
    ).toEqual({
      action: "none",
      targetVersion: null,
      message: null,
      distribution: "direct",
      downloadUrl: null,
      storeUrl: null,
      publishedAt: null,
    })
  })
})
