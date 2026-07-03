import SQLiteESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs"
import { IDBMirrorVFS as MyVFS } from "wa-sqlite/src/examples/IDBMirrorVFS.js"
import * as SQLite from "wa-sqlite/src/sqlite-api.js"

const SQLITE_HEADER = "SQLite format 3\u0000"
const SQLITE_HEADER_BYTES = new TextEncoder().encode(SQLITE_HEADER)
const SQLITE_PAGE_SIZE_OFFSET = 16
const SQLITE_MAX_PAGE_SIZE = 65_536
const IDB_VERSION = 1

interface IDBMirrorOptions {
  databaseName: string
  sqliteFileName: string
  indexedDB?: IDBFactory
}

interface RestoreOptions extends IDBMirrorOptions {
  bytes: Uint8Array
}

interface RestoreAndValidateOptions {
  bytes: Uint8Array
  databaseName: string
  sqliteFileName: string
  tableNames: string[]
}

interface SQLiteConnectionOptions {
  databaseName: string
  mode?: "readonly" | "readwrite"
  sqliteFileName: string
}

interface SQLiteConnection {
  db: number
  sqlite3: SQLiteAPI
}

interface SQLiteAPI {
  close: (db: number) => Promise<number>
  exec: (
    db: number,
    sql: string,
    callback?: (row: SQLiteValue[], columns: string[]) => void,
  ) => Promise<number>
  open_v2: (sqliteFileName: string, flags?: number) => Promise<number>
  vfs_register: (vfs: IDBMirrorVFS, makeDefault?: boolean) => number
}

interface SQLiteModule {
  Factory: (module: unknown) => SQLiteAPI
  SQLITE_OPEN_CREATE: number
  SQLITE_OPEN_READONLY: number
  SQLITE_OPEN_READWRITE: number
}

interface IDBMirrorVFS {
  close: () => Promise<void> | void
}

interface IDBMirrorVFSConstructor {
  create: (databaseName: string, module: unknown) => Promise<IDBMirrorVFS>
}

type SQLiteValue = bigint | null | number | number[] | string | Uint8Array

export interface IDBMirrorSQLiteValidationResult {
  integrityCheck: string[]
  isIntegrityOk: boolean
  tableCounts: Record<string, number>
}

interface BlockRecord {
  path: string
  offset: number
  data: Uint8Array
}

const getIDBFactory = (factory?: IDBFactory): IDBFactory => {
  if (factory) {
    return factory
  }
  if (typeof indexedDB === "undefined") {
    throw new TypeError("indexedDB is not available")
  }
  return indexedDB
}

const promisifyIDBRequest = <TResult>(request: IDBRequest<TResult>): Promise<TResult> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const waitForTransaction = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

const openIDBMirrorDatabase = async (databaseName: string, factory: IDBFactory) => {
  const request = factory.open(databaseName, IDB_VERSION)

  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains("blocks")) {
      db.createObjectStore("blocks", { keyPath: ["path", "offset"] })
    }
    if (!db.objectStoreNames.contains("tx")) {
      db.createObjectStore("tx", { keyPath: ["path", "txId"] })
    }
  }

  return promisifyIDBRequest(request)
}

const getSQLiteModule = () => SQLite as SQLiteModule

const getIDBMirrorVFSConstructor = () => MyVFS as IDBMirrorVFSConstructor

const getSQLiteOpenFlags = (mode: SQLiteConnectionOptions["mode"]) => {
  const sqliteModule = getSQLiteModule()

  if (mode === "readwrite") {
    return sqliteModule.SQLITE_OPEN_CREATE | sqliteModule.SQLITE_OPEN_READWRITE
  }

  return sqliteModule.SQLITE_OPEN_READONLY
}

export const getIDBMirrorSQLitePath = (sqliteFileName: string) => {
  return new URL(sqliteFileName, "file://").pathname
}

export const getSQLitePageSize = (bytes: Uint8Array) => {
  if (bytes.byteLength < SQLITE_PAGE_SIZE_OFFSET + 2) {
    throw new Error("Invalid SQLite database: file is too small")
  }

  for (let index = 0; index < SQLITE_HEADER_BYTES.byteLength; index++) {
    if (bytes[index] !== SQLITE_HEADER_BYTES[index]) {
      throw new Error("Invalid SQLite database: missing SQLite header")
    }
  }

  const rawPageSize = (bytes[SQLITE_PAGE_SIZE_OFFSET]! << 8) | bytes[SQLITE_PAGE_SIZE_OFFSET + 1]!
  const pageSize = rawPageSize === 1 ? SQLITE_MAX_PAGE_SIZE : rawPageSize

  if (pageSize < 512 || pageSize > SQLITE_MAX_PAGE_SIZE || (pageSize & (pageSize - 1)) !== 0) {
    throw new Error(`Invalid SQLite database: unsupported page size ${pageSize}`)
  }

  if (bytes.byteLength % pageSize !== 0) {
    throw new Error("Invalid SQLite database: file size is not aligned to page size")
  }

  return pageSize
}

const clearRecordsForPath = (store: IDBObjectStore, path: string) => {
  return promisifyIDBRequest(store.delete(IDBKeyRange.bound([path, 0], [path, Infinity])))
}

const escapeSQLiteIdentifier = (identifier: string) => {
  if (identifier.length === 0) {
    throw new TypeError("SQLite identifier cannot be empty")
  }

  return `"${identifier.replaceAll('"', '""')}"`
}

const readScalarRows = async (sqlite3: SQLiteAPI, db: number, sql: string) => {
  const values: SQLiteValue[] = []

  await sqlite3.exec(db, sql, (row) => {
    values.push(row[0] ?? null)
  })

  return values
}

const toSafeNumber = (value: SQLiteValue | undefined, context: string) => {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(`SQLite ${context} is not an integer`)
    }
    return value
  }

  if (typeof value === "bigint") {
    const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER)
    const minSafeInteger = BigInt(Number.MIN_SAFE_INTEGER)
    if (value > maxSafeInteger || value < minSafeInteger) {
      throw new Error(`SQLite ${context} is outside the safe integer range`)
    }
    return Number(value)
  }

  throw new Error(`SQLite ${context} did not return a numeric value`)
}

export const withIDBMirrorSQLiteDatabase = async <TResult>(
  { databaseName, mode = "readonly", sqliteFileName }: SQLiteConnectionOptions,
  callback: (connection: SQLiteConnection) => Promise<TResult>,
) => {
  const module = await SQLiteESMFactory()
  const sqliteModule = getSQLiteModule()
  const sqlite3 = sqliteModule.Factory(module)
  const vfs = await getIDBMirrorVFSConstructor().create(databaseName, module)
  let db: number | undefined

  sqlite3.vfs_register(vfs, true)

  try {
    db = await sqlite3.open_v2(sqliteFileName, getSQLiteOpenFlags(mode))

    return await callback({ db, sqlite3 })
  } finally {
    try {
      if (db !== undefined) {
        await sqlite3.close(db)
      }
    } finally {
      await vfs.close()
    }
  }
}

export const getIDBMirrorSQLiteIntegrityCheck = async ({
  databaseName,
  sqliteFileName,
}: SQLiteConnectionOptions) => {
  return withIDBMirrorSQLiteDatabase(
    { databaseName, mode: "readonly", sqliteFileName },
    async ({ db, sqlite3 }) => {
      const rows = await readScalarRows(sqlite3, db, "PRAGMA integrity_check")

      if (rows.length === 0) {
        throw new Error("SQLite integrity_check returned no rows")
      }

      return rows.map(String)
    },
  )
}

export const getIDBMirrorSQLiteUserTableNames = async ({
  databaseName,
  sqliteFileName,
}: SQLiteConnectionOptions) => {
  return withIDBMirrorSQLiteDatabase(
    { databaseName, mode: "readonly", sqliteFileName },
    async ({ db, sqlite3 }) => {
      const rows = await readScalarRows(
        sqlite3,
        db,
        `
          SELECT name
          FROM sqlite_schema
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        `,
      )

      return rows.map((row) => {
        if (typeof row !== "string") {
          throw new TypeError("SQLite table name query returned a non-string value")
        }

        return row
      })
    },
  )
}

export const getIDBMirrorSQLiteTableCounts = async ({
  databaseName,
  sqliteFileName,
  tableNames,
}: SQLiteConnectionOptions & { tableNames: string[] }) => {
  return withIDBMirrorSQLiteDatabase(
    { databaseName, mode: "readonly", sqliteFileName },
    async ({ db, sqlite3 }) => {
      const tableCounts: Record<string, number> = {}

      for (const tableName of tableNames) {
        const [count] = await readScalarRows(
          sqlite3,
          db,
          `SELECT COUNT(*) FROM ${escapeSQLiteIdentifier(tableName)}`,
        )
        tableCounts[tableName] = toSafeNumber(count, `row count for ${tableName}`)
      }

      return tableCounts
    },
  )
}

export const validateIDBMirrorSQLiteDatabase = async ({
  databaseName,
  sqliteFileName,
  tableNames,
}: SQLiteConnectionOptions & {
  tableNames: string[]
}): Promise<IDBMirrorSQLiteValidationResult> => {
  return withIDBMirrorSQLiteDatabase(
    { databaseName, mode: "readonly", sqliteFileName },
    async ({ db, sqlite3 }) => {
      const integrityCheck = (await readScalarRows(sqlite3, db, "PRAGMA integrity_check")).map(
        String,
      )

      if (integrityCheck.length === 0) {
        throw new Error("SQLite integrity_check returned no rows")
      }

      const tableCounts: Record<string, number> = {}
      for (const tableName of tableNames) {
        const [count] = await readScalarRows(
          sqlite3,
          db,
          `SELECT COUNT(*) FROM ${escapeSQLiteIdentifier(tableName)}`,
        )
        tableCounts[tableName] = toSafeNumber(count, `row count for ${tableName}`)
      }

      return {
        integrityCheck,
        isIntegrityOk: integrityCheck.length === 1 && integrityCheck[0] === "ok",
        tableCounts,
      }
    },
  )
}

export const restoreIDBMirrorSQLiteDatabaseFromBytes = async ({
  bytes,
  databaseName,
  indexedDB: factory,
  sqliteFileName,
}: RestoreOptions) => {
  const pageSize = getSQLitePageSize(bytes)
  const idb = await openIDBMirrorDatabase(databaseName, getIDBFactory(factory))
  const path = getIDBMirrorSQLitePath(sqliteFileName)

  try {
    const transaction = idb.transaction(["blocks", "tx"], "readwrite")
    const blocksStore = transaction.objectStore("blocks")
    const txStore = transaction.objectStore("tx")

    await clearRecordsForPath(blocksStore, path)
    await clearRecordsForPath(txStore, path)

    for (let offset = 0; offset < bytes.byteLength; offset += pageSize) {
      blocksStore.put({
        path,
        offset,
        data: bytes.slice(offset, offset + pageSize),
      } satisfies BlockRecord)
    }

    await waitForTransaction(transaction)
  } finally {
    idb.close()
  }
}

export const restoreAndValidateIDBMirrorSQLiteDatabaseFromBytes = async ({
  bytes,
  databaseName,
  sqliteFileName,
  tableNames,
}: RestoreAndValidateOptions) => {
  await restoreIDBMirrorSQLiteDatabaseFromBytes({
    bytes,
    databaseName,
    sqliteFileName,
  })

  return validateIDBMirrorSQLiteDatabase({
    databaseName,
    sqliteFileName,
    tableNames,
  })
}

export const exportIDBMirrorSQLiteDatabaseToBytes = async ({
  databaseName,
  indexedDB: factory,
  sqliteFileName,
}: IDBMirrorOptions): Promise<Uint8Array | null> => {
  const idb = await openIDBMirrorDatabase(databaseName, getIDBFactory(factory))
  const path = getIDBMirrorSQLitePath(sqliteFileName)

  try {
    const transaction = idb.transaction(["blocks"], "readonly")
    const blocksStore = transaction.objectStore("blocks")
    const records = await promisifyIDBRequest<BlockRecord[]>(
      blocksStore.getAll(IDBKeyRange.bound([path, 0], [path, Infinity])),
    )
    await waitForTransaction(transaction)

    if (records.length === 0) {
      return null
    }

    records.sort((left, right) => left.offset - right.offset)
    const pageSize = records[0]!.data.byteLength
    const fileSize = records.at(-1)!.offset + records.at(-1)!.data.byteLength
    const bytes = new Uint8Array(fileSize)

    for (const [index, record] of records.entries()) {
      const expectedOffset = index * pageSize
      if (record.offset !== expectedOffset || record.data.byteLength !== pageSize) {
        throw new Error("Invalid IDBMirror database: non-contiguous SQLite pages")
      }
      bytes.set(record.data, record.offset)
    }

    getSQLitePageSize(bytes)

    return bytes
  } finally {
    idb.close()
  }
}

export const deleteIDBMirrorSQLiteDatabase = async ({
  databaseName,
  indexedDB: factory,
  sqliteFileName,
}: IDBMirrorOptions) => {
  const idb = await openIDBMirrorDatabase(databaseName, getIDBFactory(factory))
  const path = getIDBMirrorSQLitePath(sqliteFileName)

  try {
    const transaction = idb.transaction(["blocks", "tx"], "readwrite")
    await clearRecordsForPath(transaction.objectStore("blocks"), path)
    await clearRecordsForPath(transaction.objectStore("tx"), path)
    await waitForTransaction(transaction)
  } finally {
    idb.close()
  }
}
