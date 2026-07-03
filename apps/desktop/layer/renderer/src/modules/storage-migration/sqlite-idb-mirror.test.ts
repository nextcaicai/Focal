import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { runIDBMirrorSQLiteRestoreDryRun } from "./sqlite-dry-run"
import {
  deleteIDBMirrorSQLiteDatabase,
  exportIDBMirrorSQLiteDatabaseToBytes,
  getIDBMirrorSQLitePath,
  getSQLitePageSize,
  restoreAndValidateIDBMirrorSQLiteDatabaseFromBytes,
  restoreIDBMirrorSQLiteDatabaseFromBytes,
  withIDBMirrorSQLiteDatabase,
} from "./sqlite-idb-mirror"

const DATABASE_NAME = "WA_SQLITE_TEST"
const DRY_RUN_DATABASE_NAME = "WA_SQLITE_DRY_RUN_TEST"
const SOURCE_DATABASE_NAME = "WA_SQLITE_SOURCE_TEST"
const RESTORED_DATABASE_NAME = "WA_SQLITE_RESTORED_TEST"
const SQLITE_FILE_NAME = "follow.db"

type WebLockMode = "exclusive" | "shared"

interface WebLockHandle {
  mode: WebLockMode
  name: string
}

interface WebLockRequestOptions {
  ifAvailable?: boolean
  mode?: WebLockMode
}

type WebLockCallback<TResult> = (lock: null | WebLockHandle) => Promise<TResult> | TResult
type WebLockRequest = <TResult>(
  name: string,
  optionsOrCallback: WebLockCallback<TResult> | WebLockRequestOptions,
  maybeCallback?: WebLockCallback<TResult>,
) => Promise<TResult>

interface WebLocksShim {
  query: () => Promise<{ held: Array<{ name: string }> }>
  request: WebLockRequest
}

let originalFetch: typeof fetch | undefined

const createSqliteBytes = (pageCount: number, pageSize = 512) => {
  const bytes = new Uint8Array(pageCount * pageSize)
  bytes.set(new TextEncoder().encode("SQLite format 3\u0000"), 0)
  bytes[16] = pageSize >> 8
  bytes[17] = pageSize & 0xff

  for (let index = 100; index < bytes.byteLength; index++) {
    bytes[index] = index % 251
  }

  return bytes
}

const getFetchUrl = (input: Parameters<typeof fetch>[0]) => {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.href
  }

  return input.url
}

const installWaSQLiteWasmFetchShim = () => {
  if (originalFetch) {
    return
  }

  originalFetch = globalThis.fetch.bind(globalThis)
  const fallbackFetch = originalFetch

  vi.stubGlobal(
    "fetch",
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = getFetchUrl(input)
      if (url.startsWith("file:") && url.endsWith("/wa-sqlite-async.wasm")) {
        const bytes = await readFile(fileURLToPath(url))
        return new Response(bytes, {
          headers: {
            "Content-Type": "application/wasm",
          },
          status: 200,
        })
      }

      return fallbackFetch(input, init)
    },
  )
}

const installWebLocksShim = () => {
  const navigatorWithLocks = navigator as Navigator & { locks?: WebLocksShim }
  if (navigatorWithLocks.locks) {
    return
  }

  const heldLocks = new Map<string, number>()

  const acquire = (name: string) => {
    heldLocks.set(name, (heldLocks.get(name) ?? 0) + 1)
  }

  const release = (name: string) => {
    const nextCount = (heldLocks.get(name) ?? 1) - 1
    if (nextCount > 0) {
      heldLocks.set(name, nextCount)
    } else {
      heldLocks.delete(name)
    }
  }

  const locks: WebLocksShim = {
    async query() {
      return {
        held: Array.from(heldLocks.keys(), (name) => ({ name })),
      }
    },
    async request<TResult>(
      name: string,
      optionsOrCallback: WebLockCallback<TResult> | WebLockRequestOptions,
      maybeCallback?: WebLockCallback<TResult>,
    ) {
      const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback
      const options = typeof optionsOrCallback === "function" ? undefined : optionsOrCallback

      if (!callback) {
        throw new TypeError("Web Locks request callback is required")
      }

      if (options?.ifAvailable && heldLocks.has(name)) {
        return callback(null)
      }

      acquire(name)
      const result = callback({
        mode: options?.mode ?? "exclusive",
        name,
      })

      return Promise.resolve(result).finally(() => release(name))
    },
  }

  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: locks,
  })
}

const deleteIndexedDBDatabase = (databaseName: string) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("IndexedDB deletion blocked"))
  })

const createSeededSQLiteDatabase = async (databaseName: string) => {
  await withIDBMirrorSQLiteDatabase(
    {
      databaseName,
      mode: "readwrite",
      sqliteFileName: SQLITE_FILE_NAME,
    },
    async ({ db, sqlite3 }) => {
      await sqlite3.exec(
        db,
        `
          CREATE TABLE feeds (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL
          );
          CREATE TABLE entries (
            id TEXT PRIMARY KEY,
            feed_id TEXT NOT NULL
          );
          INSERT INTO feeds (id, title) VALUES ('feed-1', 'Feed 1'), ('feed-2', 'Feed 2');
          INSERT INTO entries (id, feed_id) VALUES ('entry-1', 'feed-1');
        `,
      )
    },
  )
}

describe("IDBMirror SQLite byte snapshots", () => {
  beforeEach(async () => {
    installWaSQLiteWasmFetchShim()
    installWebLocksShim()
    await Promise.all(
      [DATABASE_NAME, DRY_RUN_DATABASE_NAME, SOURCE_DATABASE_NAME, RESTORED_DATABASE_NAME].map(
        (databaseName) => deleteIndexedDBDatabase(databaseName),
      ),
    )
  })

  it("uses the same path format as IDBMirrorVFS", () => {
    expect(getIDBMirrorSQLitePath(SQLITE_FILE_NAME)).toBe("/follow.db")
  })

  it("reads the SQLite page size from the database header", () => {
    expect(getSQLitePageSize(createSqliteBytes(2, 512))).toBe(512)
    expect(getSQLitePageSize(createSqliteBytes(2, 4096))).toBe(4096)
  })

  it("round-trips SQLite bytes through the IDBMirror object stores", async () => {
    const original = createSqliteBytes(3)

    await restoreIDBMirrorSQLiteDatabaseFromBytes({
      bytes: original,
      databaseName: DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
    })

    const exported = await exportIDBMirrorSQLiteDatabaseToBytes({
      databaseName: DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
    })

    expect(exported).toEqual(original)
  })

  it("opens a restored SQLite database with wa-sqlite and verifies table row counts", async () => {
    await createSeededSQLiteDatabase(SOURCE_DATABASE_NAME)
    const backupBytes = await exportIDBMirrorSQLiteDatabaseToBytes({
      databaseName: SOURCE_DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
    })

    expect(backupBytes).not.toBeNull()

    if (!backupBytes) {
      throw new Error("Expected seeded SQLite backup bytes")
    }

    const validation = await restoreAndValidateIDBMirrorSQLiteDatabaseFromBytes({
      bytes: backupBytes,
      databaseName: RESTORED_DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
      tableNames: ["feeds", "entries"],
    })

    expect(validation).toEqual({
      integrityCheck: ["ok"],
      isIntegrityOk: true,
      tableCounts: {
        entries: 1,
        feeds: 2,
      },
    })
  })

  it("dry-runs a SQLite restore into an isolated database and compares the result", async () => {
    await createSeededSQLiteDatabase(SOURCE_DATABASE_NAME)

    const report = await runIDBMirrorSQLiteRestoreDryRun({
      sourceDatabaseName: SOURCE_DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
      targetDatabaseName: DRY_RUN_DATABASE_NAME,
    })

    expect(report.ok).toBe(true)
    expect(report.matches).toEqual({
      checksum: true,
      integrity: true,
      tableCounts: true,
      tableNames: true,
    })
    expect(report.source.tableNames).toEqual(["entries", "feeds"])
    expect(report.restored.tableNames).toEqual(["entries", "feeds"])
    expect(report.source.validation.tableCounts).toEqual({
      entries: 1,
      feeds: 2,
    })
    expect(report.restored.validation.tableCounts).toEqual(report.source.validation.tableCounts)
    expect(report.restored.checksum).toBe(report.source.checksum)
    await expect(
      exportIDBMirrorSQLiteDatabaseToBytes({
        databaseName: DRY_RUN_DATABASE_NAME,
        sqliteFileName: SQLITE_FILE_NAME,
      }),
    ).resolves.toBeNull()
  })

  it("replaces stale pages when restoring a smaller backup", async () => {
    await restoreIDBMirrorSQLiteDatabaseFromBytes({
      bytes: createSqliteBytes(4),
      databaseName: DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
    })

    const replacement = createSqliteBytes(2)
    await restoreIDBMirrorSQLiteDatabaseFromBytes({
      bytes: replacement,
      databaseName: DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
    })

    const exported = await exportIDBMirrorSQLiteDatabaseToBytes({
      databaseName: DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
    })

    expect(exported).toEqual(replacement)
  })

  it("returns null when the database has no stored pages", async () => {
    expect(
      await exportIDBMirrorSQLiteDatabaseToBytes({
        databaseName: DATABASE_NAME,
        sqliteFileName: SQLITE_FILE_NAME,
      }),
    ).toBeNull()
  })

  it("deletes only the requested SQLite file records", async () => {
    const original = createSqliteBytes(2)
    await restoreIDBMirrorSQLiteDatabaseFromBytes({
      bytes: original,
      databaseName: DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
    })

    await deleteIDBMirrorSQLiteDatabase({
      databaseName: DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
    })

    expect(
      await exportIDBMirrorSQLiteDatabaseToBytes({
        databaseName: DATABASE_NAME,
        sqliteFileName: SQLITE_FILE_NAME,
      }),
    ).toBeNull()
  })

  it("rejects invalid SQLite input before writing", async () => {
    await expect(
      restoreIDBMirrorSQLiteDatabaseFromBytes({
        bytes: new Uint8Array(512),
        databaseName: DATABASE_NAME,
        sqliteFileName: SQLITE_FILE_NAME,
      }),
    ).rejects.toThrow("missing SQLite header")
  })
})
