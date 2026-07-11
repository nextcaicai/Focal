import { describe, expect, test, vi } from "vitest"

import { migrate, migrateExpoSQLite } from "./migrator"

const migrationConfig = {
  journal: {
    version: "6",
    dialect: "sqlite",
    entries: [
      {
        idx: 0,
        version: "6",
        when: 1,
        tag: "0000_add_domain",
        breakpoints: true,
      },
    ],
  },
  migrations: {
    m0000: "ALTER TABLE `entry_ai_tags` ADD `domain` text;",
  },
}

describe("migrate", () => {
  test("does not mark a migration complete when an added column is still missing", async () => {
    const run = vi.fn().mockImplementation(async () => {})
    const values = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        [0, "entry_id", "text", 1, null, 1],
        [1, "tags", "text", 1, null, 0],
      ])

    await expect(migrate({ run, values }, migrationConfig)).rejects.toThrow(
      "Migration verification failed",
    )

    // CREATE migration table + attempted ALTER; no completion marker insert.
    expect(run).toHaveBeenCalledTimes(2)
  })

  test("does not mark a synchronous migration complete when an added column is missing", async () => {
    const execSync = vi.fn()
    const getAllSync = <TResult>(query: string): TResult[] => {
      if (query.startsWith("SELECT")) return []
      return [{ name: "entry_id" }, { name: "tags" }] as TResult[]
    }

    await expect(migrateExpoSQLite({ execSync, getAllSync }, migrationConfig)).rejects.toThrow(
      "Migration verification failed",
    )

    // CREATE migration table + attempted ALTER; no completion marker insert.
    expect(execSync).toHaveBeenCalledTimes(2)
  })
})
