import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { dirname, join } from "pathe"
import { describe, expect, test } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))

describe("database safety invariants", () => {
  test("desktop database operations propagate SQL failures", () => {
    const source = readFileSync(join(here, "db.desktop.ts"), "utf8")
    const adapterMatch = source.match(/db = drizzle\([\s\S]*?\n {2}\)\n\}/)
    expect(adapterMatch, "desktop database adapter not found").toBeTruthy()
    const adapterBody = adapterMatch![0]

    expect(adapterBody).toMatch(/catch \(error\)[\s\S]*?throw error/)
    expect(adapterBody).not.toMatch(/catch \(error\)[\s\S]*?return \{ rows: \[\] \}/)
  })

  test("migrateDB must never call deleteDB (regression: silent wipe on migration failure)", () => {
    const source = readFileSync(join(here, "db.desktop.ts"), "utf8")
    const migrateMatch = source.match(
      /export async function migrateDB\(\) \{[\s\S]*?\nexport async function getDBFile/,
    )
    expect(migrateMatch, "migrateDB function not found in db.desktop.ts").toBeTruthy()
    const migrateBody = migrateMatch![0]
    // Only real call sites — ignore comments.
    const callSites = migrateBody.match(/(?<![\w.])deleteDB\s*\(/g)
    expect(callSites).toBeNull()
    expect(migrateBody).toMatch(/throw error/)
  })

  test("every journal migration has a matching migrations.js entry and sql file", async () => {
    const journal = JSON.parse(readFileSync(join(here, "drizzle/meta/_journal.json"), "utf8")) as {
      entries: Array<{ idx: number; tag: string }>
    }
    const migrationsJs = readFileSync(join(here, "drizzle/migrations.js"), "utf8")

    for (const entry of journal.entries) {
      const key = `m${String(entry.idx).padStart(4, "0")}`
      expect(migrationsJs.includes(key), `missing ${key} in migrations.js for ${entry.tag}`).toBe(
        true,
      )
      // SQL file: either exact tag or idx_ prefix
      const byTag = join(here, "drizzle", `${entry.tag}.sql`)
      const byIdxGlob = `${String(entry.idx).padStart(4, "0")}_`
      const hasFile =
        (() => {
          try {
            readFileSync(byTag)
            return true
          } catch {
            return false
          }
        })() ||
        (() => {
          const { readdirSync } = require("node:fs") as typeof import("node:fs")
          return readdirSync(join(here, "drizzle")).some(
            (name: string) => name.startsWith(byIdxGlob) && name.endsWith(".sql"),
          )
        })()
      expect(hasFile, `missing sql file for journal entry ${entry.tag}`).toBe(true)
    }
  })
})
