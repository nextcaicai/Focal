import { beforeEach, describe, expect, it, vi } from "vitest"

const { getCurrentRendererManifestMock } = vi.hoisted(() => ({
  getCurrentRendererManifestMock: vi.fn<() => null | { runtimeVersion: string; version: string }>(
    () => null,
  ),
}))

vi.mock("@follow/utils/headers", () => ({
  createDesktopAPIHeaders: () => ({
    "X-App-Platform": "desktop/windows/exe",
    "X-App-Version": "0.1.7",
  }),
}))

vi.mock("@pkg", () => ({
  default: {
    version: "0.1.7",
    runtimeVersion: "0.1.7",
  },
  version: "0.1.7",
  runtimeVersion: "0.1.7",
}))

vi.mock("../env", () => ({
  channel: "stable",
}))

vi.mock("~/constants/app", () => ({
  GITHUB_OWNER: "nextcaicai",
  GITHUB_REPO: "Focal",
}))

vi.mock("~/updater/hot-updater", () => ({
  getCurrentRendererManifest: getCurrentRendererManifestMock,
  isRendererManifestUsable: (
    manifest: { runtimeVersion?: string; version?: string } | null,
    input: { appVersion: string; runtimeVersion: string },
  ) => {
    if (!manifest?.runtimeVersion || manifest.runtimeVersion !== input.runtimeVersion) {
      return false
    }

    const manifestVersion = manifest.version?.split("-")[0]
    const appVersion = input.appVersion?.split("-")[0]

    if (!manifestVersion || !appVersion) {
      return false
    }

    return manifestVersion >= appVersion
  },
}))

const githubRelease = {
  tag_name: "v0.1.9",
  html_url: "https://github.com/nextcaicai/Focal/releases/tag/v0.1.9",
  published_at: "2026-06-28T12:00:00.000Z",
  assets: [
    {
      name: "Focal-0.1.9-win32-x64.exe",
      browser_download_url:
        "https://github.com/nextcaicai/Focal/releases/download/v0.1.9/Focal-0.1.9-win32-x64.exe",
    },
  ],
}

describe("desktop updater api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn())
    getCurrentRendererManifestMock.mockReturnValue(null)
  })

  it("skips the legacy OTA manifest channel", async () => {
    const { fetchDesktopManifest } = await import("./api")
    const result = await fetchDesktopManifest()

    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("builds desktop policy from the latest GitHub release", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(githubRelease), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const { fetchDesktopPolicy } = await import("./api")
    const result = await fetchDesktopPolicy()

    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/nextcaicai/Focal/releases/latest",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          Accept: "application/vnd.github+json",
          "User-Agent": "Focal-Desktop-Updater",
        }),
      }),
    )

    expect(result).toEqual({
      action: "prompt",
      targetVersion: "0.1.9",
      message: "发现新版本，请下载安装。",
      distribution: "direct",
      downloadUrl:
        "https://github.com/nextcaicai/Focal/releases/download/v0.1.9/Focal-0.1.9-win32-x64.exe",
      storeUrl: null,
      publishedAt: "2026-06-28T12:00:00.000Z",
    })
  })

  it("includes the renderer version in OTA headers when requested", async () => {
    getCurrentRendererManifestMock.mockReturnValue({
      runtimeVersion: "0.1.7",
      version: "0.1.8",
    })

    const { buildDesktopOtaHeaders } = await import("./api")

    expect(buildDesktopOtaHeaders(true)).toEqual(
      expect.objectContaining({
        "X-App-Platform": "desktop/windows/exe",
        "X-App-Version": "0.1.7",
        "X-App-Channel": "stable",
        "X-App-Runtime-Version": "0.1.7",
        "X-App-Renderer-Version": "0.1.8",
      }),
    )
  })

  it("converts desktop manifest hash values back to hex", async () => {
    const { manifestHashToHex } = await import("./api")

    expect(manifestHashToHex("qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo")).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
  })
})
