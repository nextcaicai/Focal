import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, extname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { app, BrowserWindow, protocol } from "electron"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, "..")
const waSqliteRoot = resolve(repoRoot, "node_modules/wa-sqlite")

const parseArgs = (argv) => {
  const args = new Map()

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "(end)"}`)
    }
    args.set(key.slice(2), value)
  }

  return args
}

const args = parseArgs(process.argv.slice(2))
const userDataDir = args.get("user-data-dir")
const reportPath = args.get("report")
const appHost = args.get("host") ?? "folo.is"
const sourceDatabaseName = args.get("source-db") ?? "WA_SQLITE"
const sqliteFileName = args.get("sqlite-file") ?? "follow.db"
const targetDatabaseName =
  args.get("target-db") ?? `WA_SQLITE_MIGRATION_DRY_RUN_${Date.now().toString(36)}`

if (!userDataDir) {
  throw new Error("--user-data-dir is required")
}

if (!reportPath) {
  throw new Error("--report is required")
}

if (!existsSync(userDataDir)) {
  throw new Error(`User data directory does not exist: ${userDataDir}`)
}

const toResponse = async (path, contentType) => {
  const bytes = await readFile(path)
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
    },
  })
}

const getContentType = (path) => {
  switch (extname(path)) {
    case ".html": {
      return "text/html; charset=utf-8"
    }
    case ".js":
    case ".mjs": {
      return "text/javascript; charset=utf-8"
    }
    case ".wasm": {
      return "application/wasm"
    }
    default: {
      return "application/octet-stream"
    }
  }
}

const resolveWaSqlitePath = (pathname) => {
  const prefix = "/vendor/wa-sqlite/"
  if (!pathname.startsWith(prefix)) {
    return null
  }

  const relativePath = decodeURIComponent(pathname.slice(prefix.length))
  const resolvedPath = resolve(waSqliteRoot, relativePath)
  if (resolvedPath !== waSqliteRoot && !resolvedPath.startsWith(`${waSqliteRoot}${sep}`)) {
    throw new Error(`Blocked path outside wa-sqlite package: ${pathname}`)
  }

  return resolvedPath
}

const rendererScript = ({ sourceDatabaseName, sqliteFileName, targetDatabaseName }) => `
(async () => {
  const SQLITE_HEADER = "SQLite format 3\\u0000"
  const SQLITE_HEADER_BYTES = new TextEncoder().encode(SQLITE_HEADER)
  const SQLITE_PAGE_SIZE_OFFSET = 16
  const SQLITE_MAX_PAGE_SIZE = 65_536
  const IDB_VERSION = 1

  if (!navigator.locks) {
    throw new Error("navigator.locks is not available in this Electron renderer")
  }

  const [{ default: SQLiteESMFactory }, { IDBMirrorVFS }, SQLite] = await Promise.all([
    import("/vendor/wa-sqlite/dist/wa-sqlite-async.mjs"),
    import("/vendor/wa-sqlite/src/examples/IDBMirrorVFS.js"),
    import("/vendor/wa-sqlite/src/sqlite-api.js"),
  ])

  const getIDBMirrorSQLitePath = (fileName) => new URL(fileName, "file://").pathname

  const getSQLitePageSize = (bytes) => {
    if (bytes.byteLength < SQLITE_PAGE_SIZE_OFFSET + 2) {
      throw new Error("Invalid SQLite database: file is too small")
    }
    for (let index = 0; index < SQLITE_HEADER_BYTES.byteLength; index++) {
      if (bytes[index] !== SQLITE_HEADER_BYTES[index]) {
        throw new Error("Invalid SQLite database: missing SQLite header")
      }
    }
    const rawPageSize = (bytes[SQLITE_PAGE_SIZE_OFFSET] << 8) | bytes[SQLITE_PAGE_SIZE_OFFSET + 1]
    const pageSize = rawPageSize === 1 ? SQLITE_MAX_PAGE_SIZE : rawPageSize
    if (pageSize < 512 || pageSize > SQLITE_MAX_PAGE_SIZE || (pageSize & (pageSize - 1)) !== 0) {
      throw new Error(\`Invalid SQLite database: unsupported page size \${pageSize}\`)
    }
    if (bytes.byteLength % pageSize !== 0) {
      throw new Error("Invalid SQLite database: file size is not aligned to page size")
    }
    return pageSize
  }

  const requestToPromise = (request) =>
    new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

  const waitForTransaction = (transaction) =>
    new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })

  const databaseExists = async (name) => {
    if (typeof indexedDB.databases !== "function") {
      return true
    }
    const databases = await indexedDB.databases()
    return databases.some((database) => database.name === name)
  }

  const openMirrorDatabase = async (databaseName) => {
    const request = indexedDB.open(databaseName, IDB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains("blocks")) {
        db.createObjectStore("blocks", { keyPath: ["path", "offset"] })
      }
      if (!db.objectStoreNames.contains("tx")) {
        db.createObjectStore("tx", { keyPath: ["path", "txId"] })
      }
    }
    return requestToPromise(request)
  }

  const deleteDatabase = (databaseName) =>
    new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error(\`IndexedDB deletion blocked: \${databaseName}\`))
    })

  const clearRecordsForPath = (store, path) =>
    requestToPromise(store.delete(IDBKeyRange.bound([path, 0], [path, Infinity])))

  const exportDatabaseBytes = async ({ databaseName, sqliteFileName }) => {
    if (!(await databaseExists(databaseName))) {
      throw new Error(\`IndexedDB database does not exist: \${databaseName}\`)
    }

    const idb = await openMirrorDatabase(databaseName)
    const path = getIDBMirrorSQLitePath(sqliteFileName)
    try {
      const transaction = idb.transaction(["blocks"], "readonly")
      const records = await requestToPromise(
        transaction.objectStore("blocks").getAll(IDBKeyRange.bound([path, 0], [path, Infinity])),
      )
      await waitForTransaction(transaction)

      if (records.length === 0) {
        return null
      }

      records.sort((left, right) => left.offset - right.offset)
      const pageSize = records[0].data.byteLength
      const fileSize = records.at(-1).offset + records.at(-1).data.byteLength
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

  const restoreDatabaseBytes = async ({ bytes, databaseName, sqliteFileName }) => {
    const pageSize = getSQLitePageSize(bytes)
    const idb = await openMirrorDatabase(databaseName)
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
        })
      }

      await waitForTransaction(transaction)
    } finally {
      idb.close()
    }
  }

  const escapeIdentifier = (identifier) => {
    if (identifier.length === 0) {
      throw new TypeError("SQLite identifier cannot be empty")
    }
    return \`"\${identifier.replaceAll('"', '""')}"\`
  }

  const readScalarRows = async (sqlite3, db, sql) => {
    const values = []
    await sqlite3.exec(db, sql, (row) => {
      values.push(row[0] ?? null)
    })
    return values
  }

  const toSafeNumber = (value, context) => {
    if (typeof value === "number") {
      if (!Number.isInteger(value)) {
        throw new TypeError(\`SQLite \${context} is not an integer\`)
      }
      return value
    }
    if (typeof value === "bigint") {
      const max = BigInt(Number.MAX_SAFE_INTEGER)
      const min = BigInt(Number.MIN_SAFE_INTEGER)
      if (value > max || value < min) {
        throw new Error(\`SQLite \${context} is outside the safe integer range\`)
      }
      return Number(value)
    }
    throw new Error(\`SQLite \${context} did not return a numeric value\`)
  }

  const withDatabase = async ({ databaseName, sqliteFileName, mode = "readonly" }, callback) => {
    const module = await SQLiteESMFactory()
    const sqlite3 = SQLite.Factory(module)
    const vfs = await IDBMirrorVFS.create(databaseName, module)
    let db
    sqlite3.vfs_register(vfs, true)

    try {
      const flags =
        mode === "readwrite"
          ? SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE
          : SQLite.SQLITE_OPEN_READONLY
      db = await sqlite3.open_v2(sqliteFileName, flags)
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

  const getUserTableNames = ({ databaseName, sqliteFileName }) =>
    withDatabase({ databaseName, sqliteFileName }, async ({ db, sqlite3 }) => {
      const rows = await readScalarRows(
        sqlite3,
        db,
        \`
          SELECT name
          FROM sqlite_schema
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name
        \`,
      )
      return rows.map((row) => {
        if (typeof row !== "string") {
          throw new TypeError("SQLite table name query returned a non-string value")
        }
        return row
      })
    })

  const validateDatabase = ({ databaseName, sqliteFileName, tableNames }) =>
    withDatabase({ databaseName, sqliteFileName }, async ({ db, sqlite3 }) => {
      const integrityCheck = (await readScalarRows(sqlite3, db, "PRAGMA integrity_check")).map(String)
      if (integrityCheck.length === 0) {
        throw new Error("SQLite integrity_check returned no rows")
      }
      const tableCounts = {}
      for (const tableName of tableNames) {
        const [count] = await readScalarRows(
          sqlite3,
          db,
          \`SELECT COUNT(*) FROM \${escapeIdentifier(tableName)}\`,
        )
        tableCounts[tableName] = toSafeNumber(count, \`row count for \${tableName}\`)
      }
      return {
        integrityCheck,
        isIntegrityOk: integrityCheck.length === 1 && integrityCheck[0] === "ok",
        tableCounts,
      }
    })

  const sha256Hex = async (bytes) => {
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  }

  const arraysEqual = (left, right) =>
    left.length === right.length && left.every((value, index) => value === right[index])

  const recordNumbersEqual = (left, right, keys) => keys.every((key) => left[key] === right[key])

  const sourceDatabaseName = ${JSON.stringify(sourceDatabaseName)}
  const sqliteFileName = ${JSON.stringify(sqliteFileName)}
  const targetDatabaseName = ${JSON.stringify(targetDatabaseName)}

  if (sourceDatabaseName === targetDatabaseName) {
    throw new TypeError("SQLite dry-run target database must be isolated from the source database")
  }

  await deleteDatabase(targetDatabaseName).catch(() => {})

  const sourceBytes = await exportDatabaseBytes({
    databaseName: sourceDatabaseName,
    sqliteFileName,
  })
  if (!sourceBytes) {
    throw new Error("Source SQLite database has no stored pages")
  }

  const sourceTableNames = await getUserTableNames({
    databaseName: sourceDatabaseName,
    sqliteFileName,
  })
  const sourceValidation = await validateDatabase({
    databaseName: sourceDatabaseName,
    sqliteFileName,
    tableNames: sourceTableNames,
  })

  await restoreDatabaseBytes({
    bytes: sourceBytes,
    databaseName: targetDatabaseName,
    sqliteFileName,
  })

  const restoredValidation = await validateDatabase({
    databaseName: targetDatabaseName,
    sqliteFileName,
    tableNames: sourceTableNames,
  })
  const restoredBytes = await exportDatabaseBytes({
    databaseName: targetDatabaseName,
    sqliteFileName,
  })
  if (!restoredBytes) {
    throw new Error("Restored SQLite database has no stored pages")
  }
  const restoredTableNames = await getUserTableNames({
    databaseName: targetDatabaseName,
    sqliteFileName,
  })

  const sourceChecksum = await sha256Hex(sourceBytes)
  const restoredChecksum = await sha256Hex(restoredBytes)
  const matches = {
    checksum: sourceChecksum === restoredChecksum,
    integrity: sourceValidation.isIntegrityOk && restoredValidation.isIntegrityOk,
    tableCounts: recordNumbersEqual(
      sourceValidation.tableCounts,
      restoredValidation.tableCounts,
      sourceTableNames,
    ),
    tableNames: arraysEqual(sourceTableNames, restoredTableNames),
  }

  await deleteDatabase(targetDatabaseName)

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
})()
`

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
  },
])

app.setPath("userData", userDataDir)
app.commandLine.appendSwitch("disable-background-networking")
app.commandLine.appendSwitch("disable-renderer-backgrounding")

const main = async () => {
  await app.whenReady()

  protocol.handle("app", async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== appHost) {
      return new Response("Not found", { status: 404 })
    }

    const vendorPath = resolveWaSqlitePath(url.pathname)
    if (vendorPath) {
      return toResponse(vendorPath, getContentType(vendorPath))
    }

    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Focal SQLite dry-run</title>',
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      },
    )
  })

  const window = new BrowserWindow({
    height: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    width: 800,
  })

  await window.loadURL(`app://${appHost}/dry-run`)
  const report = await window.webContents.executeJavaScript(
    rendererScript({
      sourceDatabaseName,
      sqliteFileName,
      targetDatabaseName,
    }),
    true,
  )
  const output = {
    ...report,
    sourceOriginHost: appHost,
  }

  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`)

  console.info(JSON.stringify(output, null, 2))
  window.destroy()
}

main()
  .then(() => {
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
