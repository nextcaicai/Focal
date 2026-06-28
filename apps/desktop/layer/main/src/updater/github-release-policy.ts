import type { DesktopPolicyResponse } from "./types"

export interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

export interface GitHubRelease {
  tag_name: string
  html_url: string
  published_at: string
  assets: GitHubReleaseAsset[]
}

const GITHUB_API_ACCEPT = "application/vnd.github+json"
const GITHUB_API_VERSION = "2022-11-28"
const UPDATE_PROMPT_MESSAGE = "发现新版本，请下载安装。"

export function normalizeVersion(version: string): [number, number, number] {
  const segments =
    String(version)
      .replace(/^v/, "")
      .split("-")[0]
      ?.split(".")
      .map((part) => Number.parseInt(part, 10) || 0) ?? []

  return [segments[0] ?? 0, segments[1] ?? 0, segments[2] ?? 0]
}

export function isVersionLessThan(current: string, latest: string): boolean {
  const left = normalizeVersion(current)
  const right = normalizeVersion(latest)

  for (let index = 0; index < 3; index += 1) {
    const leftPart = left[index] ?? 0
    const rightPart = right[index] ?? 0

    if (leftPart < rightPart) {
      return true
    }

    if (leftPart > rightPart) {
      return false
    }
  }

  return false
}

export function resolveReleaseDownloadUrl(
  release: GitHubRelease,
  platform: string | null,
  arch: NodeJS.Architecture = process.arch,
): string {
  const assetUrl = pickReleaseAssetUrl(release.assets, platform, arch)
  return assetUrl ?? release.html_url
}

export function buildDesktopPolicyFromRelease(input: {
  currentVersion: string
  platform: string | null
  release: GitHubRelease
  arch?: NodeJS.Architecture
}): DesktopPolicyResponse {
  const latestVersion = normalizeReleaseVersion(input.release.tag_name)

  if (!isVersionLessThan(input.currentVersion, latestVersion)) {
    return {
      action: "none",
      targetVersion: null,
      message: null,
      distribution: "direct",
      downloadUrl: null,
      storeUrl: null,
      publishedAt: null,
    }
  }

  return {
    action: "prompt",
    targetVersion: latestVersion,
    message: UPDATE_PROMPT_MESSAGE,
    distribution: "direct",
    downloadUrl: resolveReleaseDownloadUrl(input.release, input.platform, input.arch),
    storeUrl: null,
    publishedAt: input.release.published_at,
  }
}

export async function fetchLatestGitHubRelease(input: {
  owner: string
  repo: string
  token?: string
}): Promise<GitHubRelease> {
  const response = await fetch(
    `https://api.github.com/repos/${input.owner}/${input.repo}/releases/latest`,
    {
      headers: buildGitHubApiHeaders(input.token),
      cache: "no-store",
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub release (${response.status})`)
  }

  return parseGitHubRelease(await response.json())
}

function buildGitHubApiHeaders(token?: string): Record<string, string> {
  return {
    Accept: GITHUB_API_ACCEPT,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "Focal-Desktop-Updater",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function parseGitHubRelease(payload: unknown): GitHubRelease {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid GitHub release response")
  }

  const data = payload as Record<string, unknown>

  if (typeof data["tag_name"] !== "string" || typeof data["html_url"] !== "string") {
    throw new TypeError("Invalid GitHub release response")
  }

  const publishedAt =
    typeof data["published_at"] === "string" ? data["published_at"] : new Date(0).toISOString()

  const assets = Array.isArray(data["assets"])
    ? data["assets"]
        .map((asset) => parseGitHubReleaseAsset(asset))
        .filter((asset): asset is GitHubReleaseAsset => asset !== null)
    : []

  return {
    tag_name: data["tag_name"],
    html_url: data["html_url"],
    published_at: publishedAt,
    assets,
  }
}

function parseGitHubReleaseAsset(payload: unknown): GitHubReleaseAsset | null {
  if (!payload || typeof payload !== "object") {
    return null
  }

  const data = payload as Record<string, unknown>

  if (typeof data["name"] !== "string" || typeof data["browser_download_url"] !== "string") {
    return null
  }

  return {
    name: data["name"],
    browser_download_url: data["browser_download_url"],
  }
}

function normalizeReleaseVersion(tagName: string): string {
  return tagName.replace(/^v/, "")
}

function pickReleaseAssetUrl(
  assets: GitHubReleaseAsset[],
  platform: string | null,
  arch: NodeJS.Architecture,
): string | null {
  if (assets.length === 0) {
    return null
  }

  const matchers = getPlatformAssetMatchers(platform, arch)

  for (const matcher of matchers) {
    const asset = assets.find((entry) => matcher(entry.name))
    if (asset) {
      return asset.browser_download_url
    }
  }

  return null
}

function getPlatformAssetMatchers(platform: string | null, arch: NodeJS.Architecture) {
  const preferArch = arch === "arm64" ? "arm64" : "x64"

  switch (platform) {
    case "desktop/macos/dmg":
    case "desktop/macos": {
      return [
        (name: string) => name.endsWith(".dmg") && name.includes(preferArch),
        (name: string) => name.endsWith(".dmg"),
      ]
    }
    case "desktop/windows/exe": {
      return [(name: string) => name.endsWith(".exe")]
    }
    case "desktop/linux": {
      return [(name: string) => name.endsWith(".AppImage")]
    }
    default: {
      return [(name: string) => /\.(?:dmg|exe|AppImage)$/i.test(name)]
    }
  }
}
