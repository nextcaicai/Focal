import fs from "node:fs"
import os from "node:os"

import path from "pathe"
import { afterEach, describe, expect, test, vi } from "vitest"

import { hasDevProfileData, migrateLegacyDevUserData } from "./dev-user-data"

const tmpDirs: string[] = []

const createTmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "focal-dev-user-data-"))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.useRealTimers()
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

const writeFile = (filePath: string, contents = "data") => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

describe("dev user data migration", () => {
  test("treats any IndexedDB origin as existing Focal dev data", () => {
    const appDataPath = createTmpDir()
    writeFile(
      path.join(
        appDataPath,
        "Focal(dev)",
        "IndexedDB",
        "http_localhost_5174.indexeddb.leveldb",
        "CURRENT",
      ),
    )
    writeFile(path.join(appDataPath, "Folo(dev)", "db.json"), "x".repeat(200))

    expect(hasDevProfileData(path.join(appDataPath, "Focal(dev)"))).toBe(true)
    expect(migrateLegacyDevUserData(appDataPath)).toBe(path.join(appDataPath, "Focal(dev)"))
    expect(fs.existsSync(path.join(appDataPath, "Focal(dev).pre-migration-1700000000000"))).toBe(
      false,
    )
  })

  test("copies legacy dev data only when the Focal dev profile has no data", () => {
    vi.setSystemTime(new Date("2026-07-13T00:00:00.000Z"))

    const appDataPath = createTmpDir()
    writeFile(path.join(appDataPath, "Focal(dev)", "empty-marker"), "")
    writeFile(path.join(appDataPath, "Folo(dev)", "db.json"), "x".repeat(200))

    expect(migrateLegacyDevUserData(appDataPath)).toBe(path.join(appDataPath, "Focal(dev)"))
    expect(fs.existsSync(path.join(appDataPath, "Focal(dev).pre-migration-1783900800000"))).toBe(
      true,
    )
    expect(fs.readFileSync(path.join(appDataPath, "Focal(dev)", "db.json"), "utf8")).toHaveLength(
      200,
    )
  })
})
