export const CHROME_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export const YOUTUBE_CONSENT_COOKIE = "CONSENT=YES+cb; SOCS=CAI"

const DEFAULT_TIMEOUT_MS = 15_000

export interface YouTubeRequestInit {
  method?: "GET" | "POST"
  headers?: Record<string, string>
  body?: string
  language?: string
  timeoutMs?: number
}

const buildHeaders = (init?: YouTubeRequestInit) => {
  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,application/json",
    ...init?.headers,
  }

  if (init?.language) {
    headers["Accept-Language"] = init.language
  }

  return headers
}

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export const isElectronRuntime = () => typeof process.versions.electron === "string"

export const fetchWithElectronSession = async (url: string, init?: YouTubeRequestInit) => {
  if (!isElectronRuntime()) {
    return null
  }

  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const electron = await import("electron")
    return await electron.net.fetch(url, {
      method: init?.method ?? "GET",
      session: electron.session.defaultSession,
      headers: buildHeaders(init),
      body: init?.body,
      signal: controller.signal,
    } as RequestInit & { session: Electron.Session })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export const fetchYouTubeResource = async (url: string, init?: YouTubeRequestInit) => {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const requestInit: RequestInit = {
    method: init?.method ?? "GET",
    headers: buildHeaders(init),
    body: init?.body,
    redirect: "follow",
  }

  const sessionResponse = await fetchWithElectronSession(url, init)
  if (sessionResponse?.ok) {
    return sessionResponse
  }

  return fetchWithTimeout(url, requestInit, timeoutMs)
}

export const readResponseText = async (response: Response, maxBytes = 5 * 1024 * 1024) => {
  const contentLength = response.headers.get("content-length")
  if (contentLength && Number.parseInt(contentLength, 10) > maxBytes) {
    throw new Error("YouTube response too large")
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > maxBytes) {
    throw new Error("YouTube response too large")
  }

  return new TextDecoder().decode(buffer)
}
