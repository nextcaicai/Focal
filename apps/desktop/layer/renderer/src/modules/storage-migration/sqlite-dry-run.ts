import { sha256Hex } from "./manifest"
import {
  deleteIDBMirrorSQLiteDatabase,
  exportIDBMirrorSQLiteDatabaseToBytes,
  getIDBMirrorSQLiteUserTableNames,
  restoreAndValidateIDBMirrorSQLiteDatabaseFromBytes,
  validateIDBMirrorSQLiteDatabase,
} from "./sqlite-idb-mirror"

export interface IDBMirrorSQLiteRestoreDryRunOptions {
  cleanupTarget?: boolean
  sourceDatabaseName: string
  sqliteFileName: string
  tableNames?: string[]
  targetDatabaseName: string
}

export interface IDBMirrorSQLiteRestoreDryRunReport {
  matches: {
    checksum: boolean
    integrity: boolean
    tableCounts: boolean
    tableNames: boolean
  }
  ok: boolean
  restored: {
    byteLength: number
    checksum: string
    databaseName: string
    tableNames: string[]
    validation: {
      integrityCheck: string[]
      isIntegrityOk: boolean
      tableCounts: Record<string, number>
    }
  }
  source: {
    byteLength: number
    checksum: string
    databaseName: string
    tableNames: string[]
    validation: {
      integrityCheck: string[]
      isIntegrityOk: boolean
      tableCounts: Record<string, number>
    }
  }
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

export const runIDBMirrorSQLiteRestoreDryRun = async ({
  cleanupTarget = true,
  sourceDatabaseName,
  sqliteFileName,
  tableNames,
  targetDatabaseName,
}: IDBMirrorSQLiteRestoreDryRunOptions): Promise<IDBMirrorSQLiteRestoreDryRunReport> => {
  if (sourceDatabaseName === targetDatabaseName) {
    throw new TypeError("SQLite dry-run target database must be isolated from the source database")
  }

  const sourceBytes = await exportIDBMirrorSQLiteDatabaseToBytes({
    databaseName: sourceDatabaseName,
    sqliteFileName,
  })

  if (!sourceBytes) {
    throw new Error("Source SQLite database has no stored pages")
  }

  const sourceTableNames = await getIDBMirrorSQLiteUserTableNames({
    databaseName: sourceDatabaseName,
    sqliteFileName,
  })
  const tableNamesToCheck = tableNames ?? sourceTableNames
  const sourceValidation = await validateIDBMirrorSQLiteDatabase({
    databaseName: sourceDatabaseName,
    sqliteFileName,
    tableNames: tableNamesToCheck,
  })
  const restoredValidation = await restoreAndValidateIDBMirrorSQLiteDatabaseFromBytes({
    bytes: sourceBytes,
    databaseName: targetDatabaseName,
    sqliteFileName,
    tableNames: tableNamesToCheck,
  })
  const restoredBytes = await exportIDBMirrorSQLiteDatabaseToBytes({
    databaseName: targetDatabaseName,
    sqliteFileName,
  })

  if (!restoredBytes) {
    throw new Error("Restored SQLite database has no stored pages")
  }

  const restoredTableNames = await getIDBMirrorSQLiteUserTableNames({
    databaseName: targetDatabaseName,
    sqliteFileName,
  })
  const sourceChecksum = await sha256Hex(sourceBytes)
  const restoredChecksum = await sha256Hex(restoredBytes)
  const matches = {
    checksum: sourceChecksum === restoredChecksum,
    integrity: sourceValidation.isIntegrityOk && restoredValidation.isIntegrityOk,
    tableCounts: areNumberRecordsEqual(
      sourceValidation.tableCounts,
      restoredValidation.tableCounts,
      tableNamesToCheck,
    ),
    tableNames: areStringArraysEqual(sourceTableNames, restoredTableNames),
  }

  if (cleanupTarget) {
    await deleteIDBMirrorSQLiteDatabase({
      databaseName: targetDatabaseName,
      sqliteFileName,
    })
  }

  return {
    matches,
    ok: matches.checksum && matches.integrity && matches.tableCounts && matches.tableNames,
    restored: {
      byteLength: restoredBytes.byteLength,
      checksum: restoredChecksum,
      databaseName: targetDatabaseName,
      tableNames: restoredTableNames,
      validation: restoredValidation,
    },
    source: {
      byteLength: sourceBytes.byteLength,
      checksum: sourceChecksum,
      databaseName: sourceDatabaseName,
      tableNames: sourceTableNames,
      validation: sourceValidation,
    },
  }
}
