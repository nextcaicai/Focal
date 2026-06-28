const DEFAULT_LATEST_VERSION = "0.1.8"
const DEFAULT_RELEASE_URL = "https://github.com/nextcaicai/Focal/releases"
const DEFAULT_PUBLISHED_AT = "2026-06-28T00:00:00.000Z"

export default {
  async fetch(request, env = {}) {
    return handleRequest(request, env)
  },
}

export async function handleRequest(request, env = {}) {
  const url = new URL(request.url)

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() })
  }

  if (request.method !== "GET") {
    return text("Method not allowed", 405)
  }

  if (url.pathname === "/") {
    return json({
      ok: true,
      service: "focal-ota",
      latestVersion: getLatestVersion(env),
    })
  }

  if (url.pathname === "/manifest") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    })
  }

  if (url.pathname === "/policy") {
    return json(buildPolicy(request, env))
  }

  return text("Not found", 404)
}

export function buildPolicy(request, env = {}) {
  const currentVersion = request.headers.get("X-App-Version") || "0.0.0"
  const latestVersion = getLatestVersion(env)

  if (!isVersionLessThan(currentVersion, latestVersion)) {
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
    message: "发现新版本，请下载安装。",
    distribution: "direct",
    downloadUrl: getDownloadUrl(request, env),
    storeUrl: null,
    publishedAt: env.PUBLISHED_AT || DEFAULT_PUBLISHED_AT,
  }
}

export function isVersionLessThan(current, latest) {
  const left = normalizeVersion(current)
  const right = normalizeVersion(latest)

  for (let i = 0; i < 3; i += 1) {
    if (left[i] < right[i]) return true
    if (left[i] > right[i]) return false
  }

  return false
}

function getLatestVersion(env) {
  return env.LATEST_VERSION || DEFAULT_LATEST_VERSION
}

function getDownloadUrl(request, env) {
  const platform = request.headers.get("X-App-Platform")
  const platformUrlMap = {
    "desktop/macos/dmg": env.DOWNLOAD_MACOS_DMG_URL,
    "desktop/windows/exe": env.DOWNLOAD_WINDOWS_EXE_URL,
    "desktop/linux": env.DOWNLOAD_LINUX_URL,
  }

  return platformUrlMap[platform] || env.LATEST_RELEASE_URL || DEFAULT_RELEASE_URL
}

function normalizeVersion(version) {
  return String(version)
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0)
    .concat([0, 0, 0])
    .slice(0, 3)
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  })
}

function text(body, status) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "text/plain; charset=utf-8",
    },
  })
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "*",
  }
}
