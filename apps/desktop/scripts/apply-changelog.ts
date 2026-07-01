import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { fileURLToPath } from "node:url"

import { dirname, join } from "pathe"

import { CHANGELOG_LANGUAGES } from "../changelog/constants"

const __dirname = dirname(fileURLToPath(import.meta.url))
const changelogDir = join(__dirname, "..", "changelog")
const nextDir = join(changelogDir, "next")
const templatesDir = join(changelogDir, "templates")

const newVersion = process.argv[2]
if (!newVersion) {
  throw new Error("Missing version argument")
}

const majorMinorPatch = newVersion.split("-")[0]
const versionDir = join(changelogDir, majorMinorPatch)

if (!existsSync(nextDir)) {
  throw new Error(`Missing changelog draft directory: ${nextDir}`)
}

if (existsSync(versionDir)) {
  throw new Error(`Changelog directory already exists for version ${majorMinorPatch}`)
}

renameSync(nextDir, versionDir)

for (const lang of CHANGELOG_LANGUAGES) {
  const filePath = join(versionDir, `${lang}.md`)
  if (!existsSync(filePath)) continue

  const content = readFileSync(filePath, "utf-8").replaceAll("NEXT_VERSION", majorMinorPatch)
  writeFileSync(filePath, content)
}

mkdirSync(nextDir)
for (const lang of CHANGELOG_LANGUAGES) {
  copyFileSync(join(templatesDir, `${lang}.md`), join(nextDir, `${lang}.md`))
}
