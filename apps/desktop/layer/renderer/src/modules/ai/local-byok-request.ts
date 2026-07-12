import { ipcServices } from "~/lib/client"

export interface OpenAICompatibleChatCompletionInput {
  baseURL: string
  apiKey?: string
  headers?: Record<string, string>
  body: Record<string, unknown>
}

interface OpenAICompatibleEmbeddingInput {
  baseURL: string
  apiKey: string
  body: Record<string, unknown>
}

export interface OpenAICompatibleChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | null
    }
  }[]
}

export interface OpenAICompatibleChatCompletionChunk {
  choices?: {
    delta?: {
      content?: string | null
    }
  }[]
}

export interface OpenAICompatibleEmbeddingResponse {
  data?: Array<{
    index?: number
    embedding?: number[]
  }>
}

const normalizeOpenAIBaseURL = (baseURL: string) => baseURL.replace(/\/+$/, "")

const toReadableErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return String(error)
}

const fetchOpenAICompatibleChatCompletion = async ({
  baseURL,
  apiKey,
  headers,
  body,
}: OpenAICompatibleChatCompletionInput) => {
  const endpoint = `${normalizeOpenAIBaseURL(baseURL)}/chat/completions`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new Error(
      `Failed to reach LLM provider at ${baseURL}. Check the Base URL, network, proxy, or provider CORS settings. ${toReadableErrorMessage(error)}`,
    )
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(errorText || `LLM provider request failed with HTTP ${response.status}.`)
  }

  return response.json() as Promise<OpenAICompatibleChatCompletionResponse>
}

export const requestOpenAICompatibleChatCompletion = async (
  input: OpenAICompatibleChatCompletionInput,
) => {
  // Always use IPC in Electron to avoid CORS issues in production (webSecurity: true)
  if (ipcServices?.ai?.openAICompatibleChatCompletion) {
    return ipcServices.ai.openAICompatibleChatCompletion(
      input,
    ) as Promise<OpenAICompatibleChatCompletionResponse>
  }

  // In non-Electron environments (web), use direct fetch
  return fetchOpenAICompatibleChatCompletion(input)
}

export async function* requestOpenAICompatibleChatCompletionStream(
  input: OpenAICompatibleChatCompletionInput,
) {
  const endpoint = `${normalizeOpenAIBaseURL(input.baseURL)}/chat/completions`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
        "Content-Type": "application/json",
        ...input.headers,
      },
      body: JSON.stringify(input.body),
    })
  } catch (error) {
    throw new Error(
      `Failed to reach LLM provider at ${input.baseURL}. Check the Base URL, network, proxy, or provider CORS settings. ${toReadableErrorMessage(error)}`,
    )
  }

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "")
    throw new Error(errorText || `LLM provider request failed with HTTP ${response.status}.`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() ?? ""

    for (const event of events) {
      const dataLines = event
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())

      for (const data of dataLines) {
        if (!data || data === "[DONE]") continue

        const chunk = JSON.parse(data) as OpenAICompatibleChatCompletionChunk
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          yield delta
        }
      }
    }
  }
}

const fetchOpenAICompatibleEmbedding = async ({
  baseURL,
  apiKey,
  body,
}: OpenAICompatibleEmbeddingInput) => {
  const endpoint = `${normalizeOpenAIBaseURL(baseURL)}/embeddings`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new Error(
      `Failed to reach embedding provider at ${baseURL}. Check the Base URL, network, proxy, or provider CORS settings. ${toReadableErrorMessage(error)}`,
    )
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new Error(errorText || `Embedding provider request failed with HTTP ${response.status}.`)
  }

  return response.json() as Promise<OpenAICompatibleEmbeddingResponse>
}

export const requestOpenAICompatibleEmbedding = async (input: OpenAICompatibleEmbeddingInput) => {
  // Always use IPC in Electron to avoid CORS issues in production (webSecurity: true)
  if (ipcServices?.ai?.openAICompatibleEmbedding) {
    return ipcServices.ai.openAICompatibleEmbedding(
      input,
    ) as Promise<OpenAICompatibleEmbeddingResponse>
  }

  // In non-Electron environments (web), use direct fetch
  return fetchOpenAICompatibleEmbedding(input)
}
