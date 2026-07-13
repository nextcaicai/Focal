import { readFileSync } from "node:fs"

import sqlite3InitModule from "@sqlite.org/sqlite-wasm"
import { describe, expect, test, vi } from "vitest"

import { migrate, migrateExpoSQLite } from "./migrator"

const aiChatMigrationSql = readFileSync(
  new URL("drizzle/0033_shiny_sebastian_shaw.sql", import.meta.url),
  "utf8",
)
const sqlite3Promise = sqlite3InitModule({ print: () => {}, printErr: () => {} })

type Sqlite3Static = Awaited<ReturnType<typeof sqlite3InitModule>>
type WasmSqliteDatabase = InstanceType<Sqlite3Static["oo1"]["DB"]>

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

const aiChatSchemaMigrationConfig = {
  journal: {
    version: "6",
    dialect: "sqlite",
    entries: [
      {
        idx: 33,
        version: "6",
        when: 33,
        tag: "0033_shiny_sebastian_shaw",
        breakpoints: true,
      },
    ],
  },
  migrations: {
    m0033: aiChatMigrationSql,
  },
}

async function createMemoryMigrationDb() {
  const sqlite3 = await sqlite3Promise
  const sqlite = new sqlite3.oo1.DB(":memory:", "ct")
  const db = {
    execSync: (query: string) => {
      sqlite.exec(query)
    },
    getAllSync: <TResult>(query: string): TResult[] => {
      return sqlite.exec(query, {
        returnValue: "resultRows",
        rowMode: "object",
      }) as TResult[]
    },
  }

  return { sqlite, db }
}

function setupLegacyAiChatSchema(sqlite: WasmSqliteDatabase) {
  sqlite.exec(`
    CREATE TABLE ai_chat (
      room_id text PRIMARY KEY NOT NULL,
      title text,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
    );

    CREATE TABLE ai_chat_messages (
      room_id text NOT NULL,
      id text PRIMARY KEY NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      message text NOT NULL,
      FOREIGN KEY (room_id) REFERENCES ai_chat(room_id) ON UPDATE no action ON DELETE no action
    );

    CREATE UNIQUE INDEX ai_chat_messages_unq ON ai_chat_messages (room_id, id);
  `)

  sqlite.exec("INSERT INTO ai_chat(room_id, title, created_at) VALUES (?, ?, ?)", {
    bind: ["chat-1", "Legacy chat", 100],
  })
  sqlite.exec(
    "INSERT INTO ai_chat_messages(room_id, id, created_at, message) VALUES (?, ?, ?, ?)",
    {
      bind: [
        "chat-1",
        "message-1",
        101,
        JSON.stringify({
          role: "assistant",
          metadata: { source: "legacy" },
          parts: [{ type: "text", text: "Hello from old AI chat" }],
        }),
      ],
    },
  )
  sqlite.exec(
    "INSERT INTO ai_chat_messages(room_id, id, created_at, message) VALUES (?, ?, ?, ?)",
    {
      bind: ["chat-1", "message-2", 102, "Plain legacy prompt"],
    },
  )
}

function setupPartiallyAppliedAiChatMigration(sqlite: WasmSqliteDatabase) {
  sqlite.exec(`
    ALTER TABLE ai_chat RENAME TO ai_chat_sessions;
    ALTER TABLE ai_chat_sessions RENAME COLUMN room_id TO id;
    ALTER TABLE ai_chat_sessions ADD updated_at integer DEFAULT 0 NOT NULL;
    UPDATE ai_chat_sessions SET updated_at = COALESCE(created_at, unixepoch() * 1000) WHERE updated_at = 0;
    CREATE INDEX idx_ai_chat_sessions_updated_at ON ai_chat_sessions (updated_at);
    PRAGMA foreign_keys=OFF;
    CREATE TABLE __new_ai_chat_messages (
      id text PRIMARY KEY NOT NULL,
      chat_id text NOT NULL,
      role text NOT NULL,
      rich_text_schema text,
      created_at integer,
      metadata text,
      status text DEFAULT 'completed',
      finished_at integer,
      message_parts text,
      FOREIGN KEY (chat_id) REFERENCES ai_chat_sessions(id) ON UPDATE no action ON DELETE cascade
    );
  `)
}

function setupAiChatMigrationAfterDroppingOldMessages(sqlite: WasmSqliteDatabase) {
  setupPartiallyAppliedAiChatMigration(sqlite)
  sqlite.exec(`
    INSERT INTO __new_ai_chat_messages(id, chat_id, role, created_at, metadata, status, finished_at, message_parts)
    SELECT
      id,
      room_id,
      'user',
      created_at,
      NULL,
      'completed',
      NULL,
      json_array(json_object('type', 'text', 'text', message))
    FROM ai_chat_messages;
    DROP TABLE ai_chat_messages;
  `)
}

interface MigratedAiChatMessageRow {
  id: string
  chat_id: string
  role: string
  metadata: string | null
  message_parts: string
}

function requiredString(value: unknown, columnName: string) {
  if (typeof value !== "string") {
    throw new TypeError(`Expected ${columnName} to be a string`)
  }
  return value
}

function nullableString(value: unknown, columnName: string) {
  if (value === null) {
    return null
  }
  return requiredString(value, columnName)
}

function selectMigratedAiChatMessages(
  sqlite: WasmSqliteDatabase,
  columns: string,
): MigratedAiChatMessageRow[] {
  const rows = sqlite.exec(`SELECT ${columns} FROM ai_chat_messages ORDER BY created_at`, {
    returnValue: "resultRows",
    rowMode: "object",
  })

  return rows.map((row) => ({
    id: requiredString(row["id"], "id"),
    chat_id: requiredString(row["chat_id"], "chat_id"),
    role: requiredString(row["role"], "role"),
    metadata: nullableString(row["metadata"] ?? null, "metadata"),
    message_parts: requiredString(row["message_parts"], "message_parts"),
  }))
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

  test("skips table renames that were already completed by a failed async migration", async () => {
    const run = vi.fn().mockImplementation(async () => {})
    const values = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([["ai_chat_sessions"]])

    await migrate(
      { run, values },
      {
        journal: {
          version: "6",
          dialect: "sqlite",
          entries: [
            {
              idx: 0,
              version: "6",
              when: 1,
              tag: "0000_rename_table",
              breakpoints: true,
            },
          ],
        },
        migrations: {
          m0000: "ALTER TABLE `ai_chat` RENAME TO `ai_chat_sessions`;",
        },
      },
    )

    // CREATE migration table + completion marker; the already-applied rename is skipped.
    expect(run).toHaveBeenCalledTimes(2)
  })

  test("migrates legacy AI chat messages from room/message columns to chat/message_parts", async () => {
    const { sqlite, db } = await createMemoryMigrationDb()

    try {
      setupLegacyAiChatSchema(sqlite)

      await migrateExpoSQLite(db, aiChatSchemaMigrationConfig)

      const messages = selectMigratedAiChatMessages(
        sqlite,
        "id, chat_id, role, metadata, message_parts",
      )

      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatchObject({
        id: "message-1",
        chat_id: "chat-1",
        role: "assistant",
        metadata: JSON.stringify({ source: "legacy" }),
      })
      expect(JSON.parse(messages[0]!.message_parts)).toEqual([
        { type: "text", text: "Hello from old AI chat" },
      ])

      expect(messages[1]).toMatchObject({
        id: "message-2",
        chat_id: "chat-1",
        role: "user",
      })
      expect(JSON.parse(messages[1]!.message_parts)).toEqual([
        { type: "text", text: "Plain legacy prompt" },
      ])
    } finally {
      sqlite.close()
    }
  })

  test("recovers legacy AI chat migration after the old failing migration created temp tables", async () => {
    const { sqlite, db } = await createMemoryMigrationDb()

    try {
      setupLegacyAiChatSchema(sqlite)
      setupPartiallyAppliedAiChatMigration(sqlite)

      await migrateExpoSQLite(db, aiChatSchemaMigrationConfig)

      const messages = selectMigratedAiChatMessages(sqlite, "id, chat_id, role, message_parts")

      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatchObject({
        id: "message-1",
        chat_id: "chat-1",
        role: "assistant",
      })
      expect(JSON.parse(messages[0]!.message_parts)).toEqual([
        { type: "text", text: "Hello from old AI chat" },
      ])
    } finally {
      sqlite.close()
    }
  })

  test("preserves migrated AI chat messages if the previous migration dropped the old table before rename", async () => {
    const { sqlite, db } = await createMemoryMigrationDb()

    try {
      setupLegacyAiChatSchema(sqlite)
      setupAiChatMigrationAfterDroppingOldMessages(sqlite)

      await migrateExpoSQLite(db, aiChatSchemaMigrationConfig)

      const messages = selectMigratedAiChatMessages(sqlite, "id, chat_id, role, message_parts")

      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatchObject({
        id: "message-1",
        chat_id: "chat-1",
        role: "user",
      })
      expect(JSON.parse(messages[0]!.message_parts)).toEqual([
        {
          text: JSON.stringify({
            role: "assistant",
            metadata: { source: "legacy" },
            parts: [{ type: "text", text: "Hello from old AI chat" }],
          }),
          type: "text",
        },
      ])
    } finally {
      sqlite.close()
    }
  })
})
