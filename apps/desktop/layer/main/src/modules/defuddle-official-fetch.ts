import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import { dirname, join } from "pathe"

interface DefuddleFetchModule {
  fetchPage: (targetUrl: string, userAgent: string, language?: string) => Promise<string>
  getInitialUA: (targetUrl: string) => string
  BOT_UA: string
  DEFAULT_UA: string
}

const require = createRequire(import.meta.url)

const resolveDefuddleFetchPath = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url))

  while (true) {
    const candidate = join(dir, "node_modules/defuddle/dist/fetch.js")
    if (existsSync(candidate)) {
      return candidate
    }

    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }

  throw new Error("defuddle fetch module not found")
}

const defuddleFetch = require(resolveDefuddleFetchPath()) as DefuddleFetchModule

export const { fetchPage } = defuddleFetch
export const { getInitialUA } = defuddleFetch
export const { BOT_UA } = defuddleFetch
export const { DEFAULT_UA } = defuddleFetch
