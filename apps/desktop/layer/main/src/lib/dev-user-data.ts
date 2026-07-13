import fs from "node:fs"

import path from "pathe"

const directoryHasEntries = (dir: string) => {
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0
}

const dbJsonHasData = (profileDir: string) => {
  const dbJsonPath = path.join(profileDir, "db.json")
  return fs.existsSync(dbJsonPath) && fs.statSync(dbJsonPath).size > 100
}

const indexedDbHasData = (profileDir: string) => {
  const indexedDbRoot = path.join(profileDir, "IndexedDB")
  if (!directoryHasEntries(indexedDbRoot)) {
    return false
  }

  return fs.readdirSync(indexedDbRoot, { withFileTypes: true }).some((entry) => {
    return (
      entry.isDirectory() &&
      entry.name.endsWith(".indexeddb.leveldb") &&
      directoryHasEntries(path.join(indexedDbRoot, entry.name))
    )
  })
}

const localStorageHasData = (profileDir: string) => {
  return directoryHasEntries(path.join(profileDir, "Local Storage"))
}

export const hasDevProfileData = (profileDir: string) => {
  return (
    dbJsonHasData(profileDir) || indexedDbHasData(profileDir) || localStorageHasData(profileDir)
  )
}

export const migrateLegacyDevUserData = (appDataPath: string) => {
  const userDataDir = path.join(appDataPath, "Focal(dev)")
  const legacyUserDataDir = path.join(appDataPath, "Folo(dev)")

  if (!fs.existsSync(legacyUserDataDir)) {
    return userDataDir
  }

  if (hasDevProfileData(userDataDir) || !hasDevProfileData(legacyUserDataDir)) {
    return userDataDir
  }

  if (fs.existsSync(userDataDir)) {
    fs.renameSync(userDataDir, `${userDataDir}.pre-migration-${Date.now()}`)
  }

  fs.cpSync(legacyUserDataDir, userDataDir, { recursive: true })
  return userDataDir
}
