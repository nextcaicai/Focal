import { createDesktopAPIHeaders } from "@follow/utils/headers"
import PKG, { runtimeVersion as configuredRuntimeVersion, version as appVersion } from "@pkg"

import { GITHUB_OWNER, GITHUB_REPO } from "~/constants/app"
import { getCurrentRendererManifest, isRendererManifestUsable } from "~/updater/hot-updater"

import { channel } from "../env"
import { buildDesktopPolicyFromRelease, fetchLatestGitHubRelease } from "./github-release-policy"
import type { DesktopManifestResponse, DesktopPolicyResponse } from "./types"

export { manifestHashToHex } from "./types"

export const getDesktopRuntimeVersion = () => configuredRuntimeVersion ?? appVersion

export const getDesktopRendererVersion = () => {
  const rendererManifest = getCurrentRendererManifest()

  return isRendererManifestUsable(rendererManifest, {
    appVersion,
    runtimeVersion: getDesktopRuntimeVersion(),
  })
    ? rendererManifest!.version
    : appVersion
}

export const buildDesktopOtaHeaders = (includeRenderer = false): Record<string, string> => {
  const headers: Record<string, string> = {
    ...createDesktopAPIHeaders({ version: PKG.version }),
    "X-App-Channel": channel,
    "X-App-Runtime-Version": getDesktopRuntimeVersion(),
  }

  if (includeRenderer) {
    headers["X-App-Renderer-Version"] = getDesktopRendererVersion()
  }

  return headers
}

export const fetchDesktopManifest = async (): Promise<DesktopManifestResponse | null> => {
  // Renderer hot updates are disabled; GitHub Release is the primary update path.
  return null
}

export const fetchDesktopPolicy = async (): Promise<DesktopPolicyResponse> => {
  const headers = buildDesktopOtaHeaders(false)
  const currentVersion = headers["X-App-Version"] ?? appVersion
  const platform = headers["X-App-Platform"] ?? null

  const release = await fetchLatestGitHubRelease({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    token: process.env.GITHUB_TOKEN,
  })

  return buildDesktopPolicyFromRelease({
    currentVersion,
    platform,
    release,
  })
}
