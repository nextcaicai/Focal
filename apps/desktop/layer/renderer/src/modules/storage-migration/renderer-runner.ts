import { createIDBKeyValueSnapshot, restoreIDBKeyValueSnapshot } from "./idb-keyval"
import { createLocalStorageSnapshot, restoreLocalStorageSnapshot } from "./local-storage"
import { sha256Hex } from "./manifest"
import { createStorageBackupSnapshot } from "./snapshot"
import {
  exportIDBMirrorSQLiteDatabaseToBytes,
  getIDBMirrorSQLiteUserTableNames,
  restoreIDBMirrorSQLiteDatabaseFromBytes,
  validateIDBMirrorSQLiteDatabase,
} from "./sqlite-idb-mirror"

const SQLITE_DATABASE_NAME = "WA_SQLITE"
const SQLITE_FILE_NAME = "follow.db"
const IMAGE_DIMENSIONS_DATABASE_NAME = "FOLLOW_IMAGE_DIMENSIONS"
const IMAGE_DIMENSIONS_STORE_NAME = "image-dimensions"

type StorageMigrationMode = "export" | "import"

interface StorageMigrationRunnerOptions {
  sourceOrigin: string
  targetOrigin: string
}

interface SerializedSQLiteSnapshot {
  base64: string
  byteLength: number
  checksum: string
  tableNames: string[]
  validation: {
    integrityCheck: string[]
    isIntegrityOk: boolean
    tableCounts: Record<string, number>
  }
}

interface SerializedStorageBackupSnapshot {
  hasData: boolean
  imageDimensions?: Awaited<ReturnType<typeof createIDBKeyValueSnapshot>>
  localStorage: ReturnType<typeof createLocalStorageSnapshot>
  manifest: Awaited<ReturnType<typeof createStorageBackupSnapshot>>["manifest"]
  sqlite?: SerializedSQLiteSnapshot
}

export interface StorageMigrationImportReport {
  matches: {
    checksum: boolean
    integrity: boolean
    tableCounts: boolean
    tableNames: boolean
  }
  ok: boolean
  restored?: {
    byteLength: number
    checksum: string
    tableNames: string[]
    validation: SerializedSQLiteSnapshot["validation"]
  }
}

type StorageMigrationRunner = (
  mode: StorageMigrationMode,
  options: StorageMigrationRunnerOptions & {
    snapshot?: SerializedStorageBackupSnapshot
  },
) => Promise<SerializedStorageBackupSnapshot | StorageMigrationImportReport>

declare global {
  interface Window {
    __FOCAL_STORAGE_MIGRATION_RUN__?: StorageMigrationRunner
  }
}

const bytesToBase64 = (bytes: Uint8Array) => {
  const chunkSize = 0x8000
  let binary = ""

  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCodePoint(...chunk)
  }

  return btoa(binary)
}

const base64ToBytes = (base64: string) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.codePointAt(index)!
  }

  return bytes
}

const areStringArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

const areNumberRecordsEqual = (
  left: Record<string, number>,
  right: Record<string, number>,
  keys: string[],
) => {
  return keys.every((key) => left[key] === right[key])
}

const exportStorageSnapshot = async ({
  sourceOrigin,
  targetOrigin,
}: StorageMigrationRunnerOptions): Promise<SerializedStorageBackupSnapshot> => {
  const sqliteBytes = await exportIDBMirrorSQLiteDatabaseToBytes({
    databaseName: SQLITE_DATABASE_NAME,
    sqliteFileName: SQLITE_FILE_NAME,
  })
  const localStorage = createLocalStorageSnapshot()
  const imageDimensions = await createIDBKeyValueSnapshot({
    databaseName: IMAGE_DIMENSIONS_DATABASE_NAME,
    storeName: IMAGE_DIMENSIONS_STORE_NAME,
  })
  const backup = await createStorageBackupSnapshot({
    imageDimensions,
    localStorage,
    sourceOrigin,
    sqlite: sqliteBytes ?? undefined,
    targetOrigin,
  })

  if (!sqliteBytes) {
    return {
      hasData: localStorage.entries.length > 0 || imageDimensions.entries.length > 0,
      imageDimensions,
      localStorage,
      manifest: backup.manifest,
    }
  }

  const tableNames = await getIDBMirrorSQLiteUserTableNames({
    databaseName: SQLITE_DATABASE_NAME,
    sqliteFileName: SQLITE_FILE_NAME,
  })
  const validation = await validateIDBMirrorSQLiteDatabase({
    databaseName: SQLITE_DATABASE_NAME,
    sqliteFileName: SQLITE_FILE_NAME,
    tableNames,
  })
  const checksum = await sha256Hex(sqliteBytes)

  return {
    hasData: true,
    imageDimensions,
    localStorage,
    manifest: backup.manifest,
    sqlite: {
      base64: bytesToBase64(sqliteBytes),
      byteLength: sqliteBytes.byteLength,
      checksum,
      tableNames,
      validation,
    },
  }
}

const importStorageSnapshot = async (
  snapshot: SerializedStorageBackupSnapshot,
): Promise<StorageMigrationImportReport> => {
  restoreLocalStorageSnapshot(snapshot.localStorage, {
    mode: "replace",
  })

  if (snapshot.imageDimensions) {
    await restoreIDBKeyValueSnapshot(snapshot.imageDimensions, {
      mode: "replace",
    })
  }

  if (!snapshot.sqlite) {
    return {
      matches: {
        checksum: true,
        integrity: true,
        tableCounts: true,
        tableNames: true,
      },
      ok: true,
    }
  }

  const sqliteBytes = base64ToBytes(snapshot.sqlite.base64)
  await restoreIDBMirrorSQLiteDatabaseFromBytes({
    bytes: sqliteBytes,
    databaseName: SQLITE_DATABASE_NAME,
    sqliteFileName: SQLITE_FILE_NAME,
  })

  const validation = await validateIDBMirrorSQLiteDatabase({
    databaseName: SQLITE_DATABASE_NAME,
    sqliteFileName: SQLITE_FILE_NAME,
    tableNames: snapshot.sqlite.tableNames,
  })
  const restoredBytes = await exportIDBMirrorSQLiteDatabaseToBytes({
    databaseName: SQLITE_DATABASE_NAME,
    sqliteFileName: SQLITE_FILE_NAME,
  })

  if (!restoredBytes) {
    throw new Error("Restored SQLite database has no stored pages")
  }

  const restoredChecksum = await sha256Hex(restoredBytes)
  const restoredTableNames = await getIDBMirrorSQLiteUserTableNames({
    databaseName: SQLITE_DATABASE_NAME,
    sqliteFileName: SQLITE_FILE_NAME,
  })
  const matches = {
    checksum:
      restoredBytes.byteLength === snapshot.sqlite.byteLength &&
      restoredChecksum === snapshot.sqlite.checksum,
    integrity: snapshot.sqlite.validation.isIntegrityOk && validation.isIntegrityOk,
    tableCounts: areNumberRecordsEqual(
      snapshot.sqlite.validation.tableCounts,
      validation.tableCounts,
      snapshot.sqlite.tableNames,
    ),
    tableNames: areStringArraysEqual(snapshot.sqlite.tableNames, restoredTableNames),
  }

  return {
    matches,
    ok: matches.checksum && matches.integrity && matches.tableCounts && matches.tableNames,
    restored: {
      byteLength: restoredBytes.byteLength,
      checksum: restoredChecksum,
      tableNames: restoredTableNames,
      validation,
    },
  }
}

export const installStorageMigrationRunner = () => {
  window.__FOCAL_STORAGE_MIGRATION_RUN__ = async (mode, options) => {
    switch (mode) {
      case "export": {
        return exportStorageSnapshot(options)
      }
      case "import": {
        if (!options.snapshot) {
          throw new TypeError("Storage migration import requires a snapshot")
        }
        return importStorageSnapshot(options.snapshot)
      }
      default: {
        throw new Error(`Unsupported storage migration mode: ${mode satisfies never}`)
      }
    }
  }
}
