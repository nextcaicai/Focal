#!/usr/bin/env tsx

import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import { fileURLToPath } from "node:url"

import path from "pathe"
import type { ResizeOptions, Sharp } from "sharp"
import sharp from "sharp"

type SharpIco = {
  sharpsToIco: (
    imageList: Sharp[],
    fileOut: string,
    options: {
      resizeOptions?: ResizeOptions
      sizes: number[] | "default"
    },
  ) => Promise<{
    height: number
    size: number
    width: number
  }>
}

const require = createRequire(import.meta.url)
const { sharpsToIco } = require("sharp-ico") as SharpIco

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDir, "..")
const repoRoot = path.resolve(desktopRoot, "../..")
const sourceSvgPath = path.resolve(repoRoot, "focal_logo.svg")

const BLUE = { alpha: 1, b: 253, g: 78, r: 0 }
const TRANSPARENT = { alpha: 0, b: 0, g: 0, r: 0 }
const MASKABLE_ICON_CONTENT_RATIO = 0.8
const VOLUME_ICON_RADIUS_RATIO = 5.37 / 24

const renderAppLogo = (size: number) =>
  sharp(sourceSvgPath, { limitInputPixels: false })
    .resize(size, size, {
      background: TRANSPARENT,
      fit: "fill",
    })
    .flatten({ background: BLUE })
    .png()

const renderMaskableLogo = async (size: number) => {
  const contentSize = Math.round(size * MASKABLE_ICON_CONTENT_RATIO)
  const content = await renderAppLogo(contentSize).toBuffer()
  const offset = Math.round((size - contentSize) / 2)

  return sharp({
    create: {
      background: BLUE,
      channels: 4,
      height: size,
      width: size,
    },
  })
    .composite([{ input: content, left: offset, top: offset }])
    .png()
}

const createRoundedMask = (size: number) => {
  const radius = Number((size * VOLUME_ICON_RADIUS_RATIO).toFixed(3))
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  )
}

const renderRoundedVolumeLogo = (size: number) =>
  renderAppLogo(size)
    .composite([{ blend: "dest-in", input: createRoundedMask(size) }])
    .png()

const writePng = async (
  relativePath: string,
  size: number,
  render: (size: number) => Sharp | Promise<Sharp> = renderAppLogo,
) => {
  const image = await render(size)
  await image.toFile(path.resolve(desktopRoot, relativePath))
}

const writeWideTile = async (relativePath: string, width: number, height: number) => {
  const logo = await renderAppLogo(height).toBuffer()
  await sharp({
    create: {
      background: BLUE,
      channels: 4,
      height,
      width,
    },
  })
    .composite([{ input: logo, left: Math.round((width - height) / 2), top: 0 }])
    .png()
    .toFile(path.resolve(desktopRoot, relativePath))
}

const writeIco = async (relativePath: string, sizes: number[]) => {
  const png = await renderAppLogo(Math.max(...sizes)).toBuffer()
  await sharpsToIco([sharp(png)], path.resolve(desktopRoot, relativePath), {
    sizes,
  })
}

const writeIcns = async (
  relativePath: string,
  render: (size: number) => Sharp | Promise<Sharp> = renderAppLogo,
) => {
  const iconsetDir = await mkdtemp(path.join(os.tmpdir(), "focal-logo-iconset-"))

  try {
    const iconsetPath = path.join(iconsetDir, "icon.iconset")
    await mkdir(iconsetPath)

    const iconsetFiles = [
      ["icon_16x16.png", 16],
      ["icon_16x16@2x.png", 32],
      ["icon_32x32.png", 32],
      ["icon_32x32@2x.png", 64],
      ["icon_128x128.png", 128],
      ["icon_128x128@2x.png", 256],
      ["icon_256x256.png", 256],
      ["icon_256x256@2x.png", 512],
      ["icon_512x512.png", 512],
      ["icon_512x512@2x.png", 1024],
    ] as const

    await Promise.all(
      iconsetFiles.map(async ([filename, size]) => {
        const image = await render(size)
        await image.toFile(path.join(iconsetPath, filename))
      }),
    )

    execFileSync("iconutil", [
      "-c",
      "icns",
      "-o",
      path.resolve(desktopRoot, relativePath),
      iconsetPath,
    ])
  } finally {
    await rm(iconsetDir, { force: true, recursive: true })
  }
}

async function main() {
  const sourceSvg = await readFile(sourceSvgPath)

  await Promise.all([
    writeFile(path.resolve(desktopRoot, "resources/icon.svg"), sourceSvg),
    writeFile(path.resolve(desktopRoot, "layer/renderer/public/icon.svg"), sourceSvg),
  ])

  await Promise.all([
    // App bundle, runtime, web, and docs use the full-bleed app profile.
    writePng("resources/icon.png", 1024),
    writePng("layer/renderer/public/focal-logo.png", 1024),
    writePng("layer/renderer/src/assets/focal-logo.png", 1024),
    writePng("layer/renderer/public/icon-192x192.png", 192),
    writePng("layer/renderer/public/icon-512x512.png", 512),
    writePng("layer/renderer/public/pwa-64x64.png", 64),
    writePng("layer/renderer/public/pwa-192x192.png", 192),
    writePng("layer/renderer/public/pwa-512x512.png", 512),
    writePng("layer/renderer/public/maskable-icon-512x512.png", 512, renderMaskableLogo),
    writePng("layer/renderer/public/apple-touch-icon-180x180.png", 180),
    writePng("static/appx/SampleAppx.44x44.png", 44),
    writePng("static/appx/SampleAppx.50x50.png", 50),
    writePng("static/appx/SampleAppx.150x150.png", 150),
    writeWideTile("static/appx/SampleAppx.310x150.png", 310, 150),
    writeIcns("resources/icon.icns"),
    // DMG volume icons are shown raw by Finder, so they need their own rounded transparent profile.
    writeIcns("static/dmg-icon.icns", renderRoundedVolumeLogo),
    writeIco("resources/icon.ico", [16, 24, 32, 48, 64, 128, 256]),
    writeIco("layer/renderer/public/favicon.ico", [48]),
  ])
}

await main()
