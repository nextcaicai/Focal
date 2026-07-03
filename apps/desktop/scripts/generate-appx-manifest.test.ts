import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

import { join } from "pathe"
import { afterEach, describe, expect, it } from "vitest"

import type { AppXManifestConfig } from "./generate-appx-manifest"
import { generateAppXManifest } from "./generate-appx-manifest"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe("generateAppXManifest", () => {
  it("registers the focal protocol while keeping legacy protocols", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "focal-appx-manifest-"))
    tempDirs.push(projectDir)

    const templatePath = join(projectDir, "appxmanifest-template.xml")
    await writeFile(
      templatePath,
      [
        '<Identity Name="{identityName}" Publisher="{publisherName}" Version="{packageVersion}" />',
        '<Application Id="{packageName}" Executable="{packageExecutable}">',
        '<uap:VisualElements DisplayName="{packageDisplayName}" BackgroundColor="{packageBackgroundColor}" Description="{packageDescription}" />',
        "<Extensions>{protocol}</Extensions>",
        "</Application>",
        "<Publisher>{publisherDisplayName}</Publisher>",
      ].join("\n"),
      "utf8",
    )

    const config: AppXManifestConfig = {
      packageName: "Focal",
      packageDisplayName: "Focal - Local-first RSS reader",
      publisherDisplayName: "Natural Selection Labs",
      identityName: "NaturalSelectionLabs.Focal",
      version: "0.2.2.0",
      publisher: "CN=test",
      packageBackgroundColor: "#0066FF",
      protocols: ["focal", "folo", "follow"],
      description: "Local-first RSS reader.",
    }

    const manifest = generateAppXManifest(config, templatePath)

    expect(manifest).toContain('<uap:Protocol Name="focal" />')
    expect(manifest).toContain('<uap:Protocol Name="folo" />')
    expect(manifest).toContain('<uap:Protocol Name="follow" />')
    expect(manifest).not.toContain("is.follow")
  })
})
