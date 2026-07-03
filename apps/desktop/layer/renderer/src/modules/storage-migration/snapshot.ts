import type { IDBKeyValueSnapshot } from "./idb-keyval"
import { restoreIDBKeyValueSnapshot } from "./idb-keyval"
import type { LocalStorageSnapshot } from "./local-storage"
import { restoreLocalStorageSnapshot } from "./local-storage"
import type { StorageBackupManifest } from "./manifest"
import { encodeJsonForChecksum, sha256Hex } from "./manifest"
import { restoreIDBMirrorSQLiteDatabaseFromBytes } from "./sqlite-idb-mirror"

export interface StorageBackupSnapshot {
  imageDimensions?: IDBKeyValueSnapshot
  localStorage: LocalStorageSnapshot
  manifest: StorageBackupManifest
  sqlite?: Uint8Array
}

export const createStorageBackupSnapshot = async ({
  imageDimensions,
  localStorage,
  now = () => new Date(),
  sourceOrigin,
  sqlite,
  targetOrigin,
}: {
  imageDimensions?: IDBKeyValueSnapshot
  localStorage: LocalStorageSnapshot
  now?: () => Date
  sourceOrigin: string
  sqlite?: Uint8Array
  targetOrigin: string
}): Promise<StorageBackupSnapshot> => {
  return {
    imageDimensions,
    localStorage,
    manifest: {
      capturedAt: now().toISOString(),
      sourceOrigin,
      targetOrigin,
      version: 1,
      sections: {
        ...(imageDimensions && {
          imageDimensions: {
            checksum: await sha256Hex(encodeJsonForChecksum(imageDimensions.entries)),
            itemCount: imageDimensions.entries.length,
          },
        }),
        localStorage: {
          checksum: await sha256Hex(encodeJsonForChecksum(localStorage.entries)),
          itemCount: localStorage.entries.length,
        },
        ...(sqlite && {
          sqlite: {
            byteLength: sqlite.byteLength,
            checksum: await sha256Hex(sqlite),
          },
        }),
      },
    },
    sqlite,
  }
}

export const restoreStorageBackupSnapshot = async (
  snapshot: StorageBackupSnapshot,
  options: {
    imageDimensions?: {
      indexedDB?: IDBFactory
    }
    localStorage?: Storage
    mode?: "merge" | "replace"
    sqlite?: {
      databaseName: string
      indexedDB?: IDBFactory
      sqliteFileName: string
    }
  },
) => {
  const mode = options.mode ?? "merge"

  restoreLocalStorageSnapshot(snapshot.localStorage, {
    mode,
    storage: options.localStorage,
  })

  if (snapshot.imageDimensions) {
    await restoreIDBKeyValueSnapshot(snapshot.imageDimensions, {
      indexedDB: options.imageDimensions?.indexedDB,
      mode,
    })
  }

  if (snapshot.sqlite) {
    if (!options.sqlite) {
      throw new Error("SQLite restore options are required when snapshot contains SQLite data")
    }

    await restoreIDBMirrorSQLiteDatabaseFromBytes({
      bytes: snapshot.sqlite,
      databaseName: options.sqlite.databaseName,
      indexedDB: options.sqlite.indexedDB,
      sqliteFileName: options.sqlite.sqliteFileName,
    })
  }
}
