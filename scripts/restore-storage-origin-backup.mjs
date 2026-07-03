#!/usr/bin/env node

import { existsSync } from "node:fs"
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"

import { join } from "pathe"

const LEGACY_APP_ORIGIN_HOST = "folo.is"
const FOCAL_APP_ORIGIN_HOST = "focal.local"

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
const userDataDir = args.get("user-data-dir")
const backupDir = args.get("backup-dir")
const reportPath = args.get("report")

if (!userDataDir) {
  throw new Error("Missing --user-data-dir")
}

if (!backupDir) {
  throw new Error("Missing --backup-dir")
}

if (!existsSync(userDataDir)) {
  throw new Error(`User data directory does not exist: ${userDataDir}`)
}

if (!existsSync(backupDir)) {
  throw new Error(`Backup directory does not exist: ${backupDir}`)
}

const getOriginIndexedDBFolderName = (host) => {
  return `app_${host}_0.indexeddb.leveldb`
}

const getRestoreTimestamp = () => {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

const readJsonFile = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch {
    return null
  }
}

const getTargetPathForBackupName = (name) => {
  if (
    name === getOriginIndexedDBFolderName(LEGACY_APP_ORIGIN_HOST) ||
    name === getOriginIndexedDBFolderName(FOCAL_APP_ORIGIN_HOST)
  ) {
    return join(userDataDir, "IndexedDB", name)
  }

  if (name === "Local Storage") {
    return join(userDataDir, name)
  }

  throw new Error(`Unsupported storage backup entry: ${name}`)
}

const moveAsideIfExists = async (path, rollbackRoot) => {
  if (!existsSync(path)) {
    return null
  }

  await mkdir(rollbackRoot, { recursive: true })
  const to = join(rollbackRoot, basename(path))
  await rename(path, to)

  return {
    from: path,
    to,
  }
}

const restoreBackupEntry = async (entry) => {
  await mkdir(dirname(entry.to), { recursive: true })
  await cp(entry.from, entry.to, {
    force: false,
    recursive: true,
  })

  return {
    from: entry.from,
    name: entry.name,
    to: entry.to,
  }
}

const manifestPath = join(backupDir, "manifest.json")
const manifest = await readJsonFile(manifestPath)

if (!manifest) {
  throw new Error(`Backup manifest is missing or invalid: ${manifestPath}`)
}

if (!Array.isArray(manifest.copied)) {
  throw new TypeError("Backup manifest copied field must be an array")
}

const entriesToRestore = manifest.copied.map((entry) => {
  if (typeof entry.name !== "string") {
    throw new TypeError("Backup manifest entry is missing a string name")
  }

  const from = resolve(backupDir, entry.name)
  if (!existsSync(from)) {
    throw new Error(`Backup entry does not exist: ${from}`)
  }

  return {
    from,
    name: entry.name,
    to: getTargetPathForBackupName(entry.name),
  }
})

const rollbackRoot = join(userDataDir, "storage-migration-restore-rollbacks", getRestoreTimestamp())
const knownTargetPaths = [
  join(userDataDir, "IndexedDB", getOriginIndexedDBFolderName(LEGACY_APP_ORIGIN_HOST)),
  join(userDataDir, "IndexedDB", getOriginIndexedDBFolderName(FOCAL_APP_ORIGIN_HOST)),
  join(userDataDir, "Local Storage"),
]

const movedAside = []
for (const targetPath of knownTargetPaths) {
  const moved = await moveAsideIfExists(targetPath, rollbackRoot)
  if (moved) {
    movedAside.push(moved)
  }
}

const restored = []
for (const entry of entriesToRestore) {
  restored.push(await restoreBackupEntry(entry))
}

const dbPath = join(userDataDir, "db.json")
const db = (await readJsonFile(dbPath)) ?? {}
const restoredAt = new Date().toISOString()

db.storageOrigin = "legacy"
db.storageOriginMigration = {
  backupPath: backupDir,
  reason: `Restored from storage origin backup ${backupDir}`,
  restoredAt,
  status: "restored",
}

await writeFile(dbPath, `${JSON.stringify(db, null, "\t")}\n`)

const report = {
  backupDir,
  dbPath,
  movedAside,
  ok: true,
  restored,
  rollbackRoot,
  storageOrigin: db.storageOrigin,
  storageOriginMigration: db.storageOriginMigration,
  userDataDir,
}

if (reportPath) {
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

console.info(JSON.stringify(report, null, 2))
