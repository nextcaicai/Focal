import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy"
import { drizzle } from "drizzle-orm/sqlite-proxy"
// @ts-expect-error
import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs"
// @ts-expect-error
import { IDBMirrorVFS as MyVFS } from "wa-sqlite/src/examples/IDBMirrorVFS.js"
// @ts-expect-error
import * as SQLite from "wa-sqlite/src/sqlite-api.js"

import { SQLITE_DB_NAME } from "./constant"
import { DatabaseSource } from "./DatabaseSource"
import migrations from "./drizzle/migrations"
import { migrate } from "./migrator"
import { resourceLock } from "./ResourceLock"
import * as schema from "./schemas"

let db: SqliteRemoteDatabase<typeof schema>

const IDB_NAME = "WA_SQLITE"

export async function initializeDB() {
  const module = await SQLiteESMFactory()
  const sqlite3 = SQLite.Factory(module)
  const vfs = await MyVFS.create(IDB_NAME, module)
  sqlite3.vfs_register(vfs, true)
  const dbSqlite3 = await sqlite3.open_v2(SQLITE_DB_NAME)

  db = drizzle(
    async (sql, params, method) => {
      let releaseLock: (() => void) | undefined
      const query = async function (db: any, sql: any) {
        releaseLock = await resourceLock.acquire()
        const rows: any[] = []

        for await (const stmt of sqlite3.statements(db, sql)) {
          if (Array.isArray(params) && params.length > 0) {
            sqlite3.bind_collection(stmt, params)
          }

          while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
            const row = sqlite3.row(stmt)
            rows.push(row)
          }
        }

        return rows
      }

      try {
        const rows = await query(dbSqlite3, sql)
        if (method === "get") {
          if (rows.length > 0) {
            return { rows: rows[0] }
          }

          return { rows: undefined }
        }

        return { rows }
      } catch (error) {
        console.error(`Error executing SQL: ${sql} with params:${params}`, error)
        throw error
      } finally {
        releaseLock && releaseLock()
      }
    },
    {
      schema,
      logger: false,
    },
  )
}
export { db }

export async function migrateDB() {
  try {
    await migrate(db, migrations)
  } catch (error) {
    // NEVER wipe / recreate the database on migration failure.
    // Prefer a hard error over silent data loss when a migration is missing
    // or invalid (e.g. journal entry without a matching migrations.js import).
    console.error("Failed to migrate database:", error)
    throw error
  }
}
export async function getDBFile() {
  const module = await SQLiteESMFactory()
  const vfs = await MyVFS.create(IDB_NAME, module)
  const source = new DatabaseSource(vfs, SQLITE_DB_NAME)
  source.isDone.finally(() => {
    vfs.close()
  })
  const response = new Response(new ReadableStream(source), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${SQLITE_DB_NAME}"`,
    },
  })
  const databaseFile = await response.blob()
  return databaseFile
}

export async function exportDB() {
  const databaseFile = await getDBFile()
  const fileUrl = URL.createObjectURL(databaseFile)

  const a = document.createElement("a")
  a.href = fileUrl
  a.download = SQLITE_DB_NAME
  a.click()
  a.remove()

  URL.revokeObjectURL(fileUrl)
}

/**
 * Explicit full wipe of the WA-SQLite IndexedDB backend.
 * Only call from deliberate user actions (e.g. "clear local data"), never from
 * automatic recovery / migration failure paths.
 */
export async function deleteDB() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(IDB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("Failed to delete database"))
    request.onblocked = () => {
      console.warn("deleteDB: delete blocked; waiting for other connections to close")
    }
  })
}
