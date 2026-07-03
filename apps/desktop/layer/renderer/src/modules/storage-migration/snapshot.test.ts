import { beforeEach, describe, expect, it } from "vitest"

import type { IDBKeyValueSnapshot } from "./idb-keyval"
import { createIDBKeyValueSnapshot, restoreIDBKeyValueSnapshot } from "./idb-keyval"
import type { LocalStorageSnapshot } from "./local-storage"
import { createStorageBackupSnapshot, restoreStorageBackupSnapshot } from "./snapshot"
import {
  exportIDBMirrorSQLiteDatabaseToBytes,
  restoreIDBMirrorSQLiteDatabaseFromBytes,
} from "./sqlite-idb-mirror"

const SQLITE_DATABASE_NAME = "WA_SQLITE_SNAPSHOT_TEST"
const SQLITE_FILE_NAME = "follow.db"
const IMAGE_DATABASE_NAME = "FOLLOW_IMAGE_DIMENSIONS_SNAPSHOT_TEST"
const IMAGE_STORE_NAME = "image-dimensions"

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

const deleteDatabase = async (databaseName: string) => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("IndexedDB deletion blocked"))
  })
}

describe("storage migration backup snapshots", () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([deleteDatabase(SQLITE_DATABASE_NAME), deleteDatabase(IMAGE_DATABASE_NAME)])
  })

  it("builds a manifest with section checksums and counts", async () => {
    const localStorage: LocalStorageSnapshot = {
      capturedAt: "2026-07-03T00:00:00.000Z",
      entries: [{ key: "follow:setting", value: "on" }],
    }
    const imageDimensions: IDBKeyValueSnapshot = {
      capturedAt: "2026-07-03T00:00:00.000Z",
      databaseName: "FOLLOW_IMAGE_DIMENSIONS",
      entries: [{ key: "https://example.com/a.png", value: { height: 100, width: 200 } }],
      storeName: "image-dimensions",
    }
    const sqlite = new Uint8Array([1, 2, 3, 4])

    const backup = await createStorageBackupSnapshot({
      imageDimensions,
      localStorage,
      now: () => new Date("2026-07-03T01:00:00Z"),
      sourceOrigin: "app://folo.is",
      sqlite,
      targetOrigin: "app://focal.local",
    })

    expect(backup.manifest).toMatchObject({
      capturedAt: "2026-07-03T01:00:00.000Z",
      sourceOrigin: "app://folo.is",
      targetOrigin: "app://focal.local",
      version: 1,
      sections: {
        imageDimensions: {
          itemCount: 1,
        },
        localStorage: {
          itemCount: 1,
        },
        sqlite: {
          byteLength: 4,
        },
      },
    })
    expect(backup.manifest.sections.imageDimensions?.checksum).toHaveLength(64)
    expect(backup.manifest.sections.localStorage.checksum).toHaveLength(64)
    expect(backup.manifest.sections.sqlite?.checksum).toHaveLength(64)
  })

  it("restores all snapshot sections with replace semantics", async () => {
    localStorage.setItem("stale", "remove")
    await restoreIDBMirrorSQLiteDatabaseFromBytes({
      bytes: createSqliteBytes(1),
      databaseName: SQLITE_DATABASE_NAME,
      sqliteFileName: SQLITE_FILE_NAME,
    })
    await restoreIDBKeyValueSnapshot({
      capturedAt: "2026-07-03T00:00:00.000Z",
      databaseName: IMAGE_DATABASE_NAME,
      entries: [{ key: "stale", value: { stale: true } }],
      storeName: IMAGE_STORE_NAME,
    })

    const sqlite = createSqliteBytes(2)
    await restoreStorageBackupSnapshot(
      {
        imageDimensions: {
          capturedAt: "2026-07-03T00:00:00.000Z",
          databaseName: IMAGE_DATABASE_NAME,
          entries: [{ key: "https://example.com/a.png", value: { height: 100, width: 200 } }],
          storeName: IMAGE_STORE_NAME,
        },
        localStorage: {
          capturedAt: "2026-07-03T00:00:00.000Z",
          entries: [{ key: "follow:setting", value: "on" }],
        },
        manifest: {
          capturedAt: "2026-07-03T01:00:00.000Z",
          sections: {
            localStorage: { checksum: "placeholder" },
          },
          sourceOrigin: "app://folo.is",
          targetOrigin: "app://focal.local",
          version: 1,
        },
        sqlite,
      },
      {
        mode: "replace",
        sqlite: {
          databaseName: SQLITE_DATABASE_NAME,
          sqliteFileName: SQLITE_FILE_NAME,
        },
      },
    )

    expect(localStorage.getItem("stale")).toBeNull()
    expect(localStorage.getItem("follow:setting")).toBe("on")
    await expect(
      exportIDBMirrorSQLiteDatabaseToBytes({
        databaseName: SQLITE_DATABASE_NAME,
        sqliteFileName: SQLITE_FILE_NAME,
      }),
    ).resolves.toEqual(sqlite)
    await expect(
      createIDBKeyValueSnapshot({
        databaseName: IMAGE_DATABASE_NAME,
        storeName: IMAGE_STORE_NAME,
      }),
    ).resolves.toMatchObject({
      entries: [{ key: "https://example.com/a.png", value: { height: 100, width: 200 } }],
    })
  })
})
