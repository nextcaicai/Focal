import { existsSync } from "node:fs"
import { cp, mkdir, writeFile } from "node:fs/promises"

import type { BrowserWindowConstructorOptions } from "electron"
import { app, BrowserWindow } from "electron"
import { basename, join } from "pathe"

import { filePathToAppUrl, FOCAL_APP_ORIGIN_HOST, LEGACY_APP_ORIGIN_HOST } from "~/helper"
import { logger } from "~/logger"

import { store } from "./store"

const MIGRATION_QUERY = "__focalStorageMigration=1"
const SQLITE_DATABASE_NAME = "WA_SQLITE"
const SQLITE_FILE_NAME = "follow.db"
const MIGRATION_RETRY_ENV = "FOCAL_RETRY_STORAGE_ORIGIN_MIGRATION"
const E2E_FAIL_AFTER_IMPORT_ENV = "FOCAL_E2E_FAIL_STORAGE_ORIGIN_MIGRATION_AFTER_IMPORT"

interface SerializedStorageBackupSnapshot {
  hasData: boolean
  manifest: {
    capturedAt: string
    sections: {
      imageDimensions?: {
        checksum: string
        itemCount?: number
      }
      localStorage: {
        checksum: string
        itemCount?: number
      }
      sqlite?: {
        byteLength?: number
        checksum: string
      }
    }
    sourceOrigin: string
    targetOrigin: string
    version: 1
  }
  sqlite?: {
    byteLength: number
    checksum: string
    tableNames: string[]
    validation: {
      integrityCheck: string[]
      isIntegrityOk: boolean
      tableCounts: Record<string, number>
    }
  }
}

interface StorageMigrationImportReport {
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
    validation: {
      integrityCheck: string[]
      isIntegrityOk: boolean
      tableCounts: Record<string, number>
    }
  }
}

interface BackupManifest {
  copied: Array<{
    from: string
    name: string
    to: string
  }>
  createdAt: string
  sourceOriginHost: string
  targetOriginHost: string
}

const hiddenWindowOptions: BrowserWindowConstructorOptions = {
  height: 600,
  show: false,
  webPreferences: {
    contextIsolation: false,
    nodeIntegration: true,
    sandbox: false,
    webSecurity: false,
  },
  width: 800,
}

const getOriginIndexedDBFolderName = (host: string) => {
  return `app_${host}_0.indexeddb.leveldb`
}

const getStorageMigrationTimestamp = () => {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

const copyIfExists = async (from: string, backupRoot: string, copied: BackupManifest["copied"]) => {
  if (!existsSync(from)) {
    return
  }

  const to = join(backupRoot, basename(from))
  await cp(from, to, {
    force: false,
    recursive: true,
  })
  copied.push({
    from,
    name: basename(from),
    to,
  })
}

const createStorageOriginBackup = async () => {
  const userDataPath = app.getPath("userData")
  const backupRoot = join(userDataPath, "storage-migration-backups", getStorageMigrationTimestamp())
  const copied: BackupManifest["copied"] = []

  await mkdir(backupRoot, { recursive: true })
  await copyIfExists(
    join(userDataPath, "IndexedDB", getOriginIndexedDBFolderName(LEGACY_APP_ORIGIN_HOST)),
    backupRoot,
    copied,
  )
  await copyIfExists(
    join(userDataPath, "IndexedDB", getOriginIndexedDBFolderName(FOCAL_APP_ORIGIN_HOST)),
    backupRoot,
    copied,
  )
  await copyIfExists(join(userDataPath, "Local Storage"), backupRoot, copied)

  const manifest: BackupManifest = {
    copied,
    createdAt: new Date().toISOString(),
    sourceOriginHost: LEGACY_APP_ORIGIN_HOST,
    targetOriginHost: FOCAL_APP_ORIGIN_HOST,
  }
  await writeFile(join(backupRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)

  return backupRoot
}

const waitForMigrationRunnerScript = (mode: "export" | "import", options: unknown) => {
  return `
    new Promise((resolve, reject) => {
      const startedAt = Date.now()
      const wait = () => {
        if (window.__FOCAL_STORAGE_MIGRATION_RUN__) {
          resolve(window.__FOCAL_STORAGE_MIGRATION_RUN__)
          return
        }
        if (Date.now() - startedAt > 30000) {
          reject(new Error("Timed out waiting for storage migration runner"))
          return
        }
        setTimeout(wait, 50)
      }
      wait()
    }).then((run) => run(${JSON.stringify(mode)}, ${JSON.stringify(options)}))
  `
}

const runMigrationWindow = async <TResult>({
  host,
  mode,
  options,
  rendererEntryPath,
}: {
  host: string
  mode: "export" | "import"
  options: unknown
  rendererEntryPath: string
}) => {
  const window = new BrowserWindow(hiddenWindowOptions)
  const loadUrl = `${filePathToAppUrl(rendererEntryPath, host)}?${MIGRATION_QUERY}`

  try {
    await window.loadURL(loadUrl)
    return (await window.webContents.executeJavaScript(
      waitForMigrationRunnerScript(mode, options),
      true,
    )) as TResult
  } finally {
    if (!window.isDestroyed()) {
      window.destroy()
    }
  }
}

const getMigrationOrigins = () => {
  return {
    sourceOrigin: `app://${LEGACY_APP_ORIGIN_HOST}`,
    targetOrigin: `app://${FOCAL_APP_ORIGIN_HOST}`,
  }
}

export const getActiveStorageOriginHost = () => {
  if (process.env["FOCAL_FORCE_LEGACY_STORAGE_ORIGIN"] === "1") {
    return LEGACY_APP_ORIGIN_HOST
  }

  return store.get("storageOrigin") === "focal" ? FOCAL_APP_ORIGIN_HOST : LEGACY_APP_ORIGIN_HOST
}

export const prepareStorageOriginMigration = async (rendererEntryPath: string) => {
  if (process.env["FOCAL_FORCE_LEGACY_STORAGE_ORIGIN"] === "1") {
    logger.warn("Using legacy storage origin because FOCAL_FORCE_LEGACY_STORAGE_ORIGIN=1")
    return LEGACY_APP_ORIGIN_HOST
  }

  if (store.get("storageOrigin") === "focal") {
    return FOCAL_APP_ORIGIN_HOST
  }

  const previousMigration = store.get("storageOriginMigration")
  if (
    store.get("storageOrigin") === "legacy" &&
    (previousMigration?.status === "failed" || previousMigration?.status === "restored") &&
    process.env[MIGRATION_RETRY_ENV] !== "1"
  ) {
    logger.warn(
      `Using legacy storage origin because the previous storage origin migration status is ${previousMigration.status}`,
      {
        retryEnv: MIGRATION_RETRY_ENV,
      },
    )
    return LEGACY_APP_ORIGIN_HOST
  }

  if (process.env["ELECTRON_RENDERER_URL"]) {
    return LEGACY_APP_ORIGIN_HOST
  }

  const startedAt = new Date().toISOString()
  let backupPath: string | undefined

  try {
    backupPath = await createStorageOriginBackup()
    const origins = getMigrationOrigins()
    const snapshot = await runMigrationWindow<SerializedStorageBackupSnapshot>({
      host: LEGACY_APP_ORIGIN_HOST,
      mode: "export",
      options: origins,
      rendererEntryPath,
    })

    if (!snapshot.hasData) {
      store.set("storageOrigin", "focal")
      store.set("storageOriginMigration", {
        backupPath,
        completedAt: new Date().toISOString(),
        status: "skipped",
      })
      logger.info("Skipped storage origin migration because no legacy data was found", {
        backupPath,
      })
      return FOCAL_APP_ORIGIN_HOST
    }

    const report = await runMigrationWindow<StorageMigrationImportReport>({
      host: FOCAL_APP_ORIGIN_HOST,
      mode: "import",
      options: {
        ...origins,
        snapshot,
      },
      rendererEntryPath,
    })

    if (!report.ok) {
      throw new Error(
        `Storage origin migration validation failed: ${JSON.stringify(report.matches)}`,
      )
    }

    if (process.env[E2E_FAIL_AFTER_IMPORT_ENV] === "1") {
      throw new Error(`Simulated storage origin migration failure via ${E2E_FAIL_AFTER_IMPORT_ENV}`)
    }

    store.set("storageOrigin", "focal")
    store.set("storageOriginMigration", {
      backupPath,
      completedAt: new Date().toISOString(),
      status: "completed",
    })
    logger.info("Completed storage origin migration", {
      backupPath,
      byteLength: snapshot.sqlite?.byteLength,
      sourceChecksum: snapshot.sqlite?.checksum,
      startedAt,
      tableCounts: snapshot.sqlite?.validation.tableCounts,
      tableNames: snapshot.sqlite?.tableNames,
      targetChecksum: report.restored?.checksum,
    })

    return FOCAL_APP_ORIGIN_HOST
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    store.set("storageOrigin", "legacy")
    store.set("storageOriginMigration", {
      backupPath,
      failedAt: new Date().toISOString(),
      reason,
      status: "failed",
    })
    logger.error("Storage origin migration failed; falling back to legacy origin", {
      backupPath,
      error,
    })

    return LEGACY_APP_ORIGIN_HOST
  }
}

export const getStorageMigrationSQLiteDatabaseName = () => SQLITE_DATABASE_NAME
export const getStorageMigrationSQLiteFileName = () => SQLITE_FILE_NAME
