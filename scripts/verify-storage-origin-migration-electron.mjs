#!/usr/bin/env node

import { existsSync } from "node:fs"
import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { _electron as electron } from "@playwright/test"
import { join } from "pathe"

const parseArgs = () => {
  const args = new Map()
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = process.argv[index]
    const value = process.argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument pair near ${key ?? "<end>"}`)
    }
    args.set(key.slice(2), value)
  }
  return args
}

const args = parseArgs()
const desktopAppDir = resolve(args.get("desktop-app-dir") ?? "apps/desktop")
const userDataDir = args.get("user-data-dir")
const reportPath = args.get("report")
const timeoutMs = Number.parseInt(args.get("timeout-ms") ?? "180000", 10)
const expectedStorageOrigin = args.get("expect-origin") ?? "focal"
const expectedMigrationStatus = args.get("expect-status") ?? "completed"
const expectedAppHost = args.get("expect-app-host") ?? "focal.local"

let electronApp
let appWindowError = null
let appWindowUrl = null
let windowUrls = []

if (!userDataDir) {
  throw new Error("Missing --user-data-dir")
}

if (!existsSync(desktopAppDir)) {
  throw new Error(`Desktop app directory does not exist: ${desktopAppDir}`)
}

if (!existsSync(userDataDir)) {
  throw new Error(`User data directory does not exist: ${userDataDir}`)
}

const dbPath = join(userDataDir, "db.json")

const readJsonFile = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return null
  }
}

const getIndexedDBFolderInfo = async (host) => {
  const path = join(userDataDir, "IndexedDB", `app_${host}_0.indexeddb.leveldb`)
  if (!existsSync(path)) {
    return {
      exists: false,
      fileCount: 0,
      path,
      sizeBytes: 0,
    }
  }

  const entries = await readdir(path)
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      try {
        return (await stat(join(path, entry))).size
      } catch {
        return 0
      }
    }),
  )

  return {
    exists: true,
    fileCount: entries.length,
    path,
    sizeBytes: sizes.reduce((total, size) => total + size, 0),
  }
}

const waitForMigrationStore = async () => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const db = await readJsonFile(dbPath)
    const status = db?.storageOriginMigration?.status
    if (
      status === "completed" ||
      status === "failed" ||
      status === "restored" ||
      status === "skipped"
    ) {
      return db
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }

  throw new Error(`Timed out waiting for storage origin migration after ${timeoutMs}ms`)
}

const waitForAppWindow = async () => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 60_000) {
    const pages = electronApp.windows()
    windowUrls = pages.map((page) => page.url())
    const appPage = pages.find((page) => {
      const url = page.url()
      return url.startsWith("app://") && !url.includes("__focalStorageMigration")
    })

    if (appPage) {
      await appPage.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {})
      appWindowUrl = appPage.url()
      return
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 500))
  }

  appWindowError = "Timed out waiting for the main app window"
}

try {
  electronApp = await electron.launch({
    args: [desktopAppDir],
    cwd: desktopAppDir,
    env: {
      ...process.env,
      CI: process.env.CI ?? "1",
      FOCAL_E2E_USER_DATA_DIR: userDataDir,
      NODE_ENV: "test",
    },
    timeout: timeoutMs,
  })

  const db = await waitForMigrationStore()
  await waitForAppWindow()

  const report = {
    appWindowError,
    appWindowUrl,
    dbPath,
    indexedDB: {
      focal: await getIndexedDBFolderInfo("focal.local"),
      legacy: await getIndexedDBFolderInfo("folo.is"),
    },
    migration: {
      storageOrigin: db.storageOrigin ?? null,
      storageOriginMigration: db.storageOriginMigration ?? null,
    },
    expected: {
      appHost: expectedAppHost,
      migrationStatus: expectedMigrationStatus,
      storageOrigin: expectedStorageOrigin,
    },
    ok:
      db.storageOrigin === expectedStorageOrigin &&
      db.storageOriginMigration?.status === expectedMigrationStatus &&
      appWindowUrl?.startsWith(`app://${expectedAppHost}`),
    userDataDir,
    windowUrls,
  }

  if (reportPath) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  }

  console.info(JSON.stringify(report, null, 2))

  if (!report.ok) {
    process.exitCode = 1
  }
} finally {
  if (electronApp) {
    await electronApp.close().catch(() => {})
  }
}
