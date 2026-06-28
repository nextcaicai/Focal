import assert from "node:assert/strict"
import test from "node:test"

import { buildPolicy, handleRequest, isVersionLessThan } from "./index.js"

const env = {
  LATEST_VERSION: "0.1.8",
  LATEST_RELEASE_URL: "https://github.com/nextcaicai/Focal/releases",
  PUBLISHED_AT: "2026-06-28T00:00:00.000Z",
  DOWNLOAD_MACOS_DMG_URL: "https://example.com/Focal-0.1.8-macos-arm64.dmg",
  DOWNLOAD_WINDOWS_EXE_URL: "https://example.com/Focal-0.1.8-windows-x64.exe",
  DOWNLOAD_LINUX_URL: "https://example.com/Focal-0.1.8-linux-x64.AppImage",
}

test("detects older semantic versions", () => {
  assert.equal(isVersionLessThan("0.1.7", "0.1.8"), true)
  assert.equal(isVersionLessThan("0.1.8", "0.1.8"), false)
  assert.equal(isVersionLessThan("0.1.9", "0.1.8"), false)
  assert.equal(isVersionLessThan("v0.1.7-beta.1", "0.1.8"), true)
})

test("returns a prompt policy for older desktop builds", () => {
  const request = new Request("https://ota.example.com/policy", {
    headers: {
      "X-App-Version": "0.1.7",
      "X-App-Platform": "desktop/macos/dmg",
    },
  })

  assert.deepEqual(buildPolicy(request, env), {
    action: "prompt",
    targetVersion: "0.1.8",
    message: "发现新版本，请下载安装。",
    distribution: "direct",
    downloadUrl: "https://example.com/Focal-0.1.8-macos-arm64.dmg",
    storeUrl: null,
    publishedAt: "2026-06-28T00:00:00.000Z",
  })
})

test("returns no update for current desktop builds", () => {
  const request = new Request("https://ota.example.com/policy", {
    headers: {
      "X-App-Version": "0.1.8",
      "X-App-Platform": "desktop/macos/dmg",
    },
  })

  assert.deepEqual(buildPolicy(request, env), {
    action: "none",
    targetVersion: null,
    message: null,
    distribution: "direct",
    downloadUrl: null,
    storeUrl: null,
    publishedAt: null,
  })
})

test("manifest currently returns 204 because renderer hot updates are disabled", async () => {
  const response = await handleRequest(new Request("https://ota.example.com/manifest"), env)

  assert.equal(response.status, 204)
})
