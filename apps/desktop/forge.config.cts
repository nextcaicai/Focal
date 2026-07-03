import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs, { readdirSync } from "node:fs"
import { cp, readdir } from "node:fs/promises"

import { FuseV1Options, FuseVersion } from "@electron/fuses"
import { MakerAppX } from "@electron-forge/maker-appx"
import { MakerDMG } from "@electron-forge/maker-dmg"
import { MakerPKG } from "@electron-forge/maker-pkg"
import { MakerSquirrel } from "@electron-forge/maker-squirrel"
import { MakerZIP } from "@electron-forge/maker-zip"
import { FusesPlugin } from "@electron-forge/plugin-fuses"
import type { ForgeConfig } from "@electron-forge/shared-types"
import MakerAppImage from "@pengx17/electron-forge-maker-appimage"
import setLanguages from "electron-packager-languages"
import yaml from "js-yaml"
import path, { resolve } from "pathe"
import { rimraf, rimrafSync } from "rimraf"

import { getFocalBundleId } from "./layer/main/src/constants/app-identity"

const ResolvedMakerAppImage: typeof MakerAppImage = (MakerAppImage as any).default || MakerAppImage
const platform = process.argv.find((arg) => arg.startsWith("--platform"))?.split("=")[1]
const mode = process.argv.find((arg) => arg.startsWith("--mode"))?.split("=")[1]
const isMicrosoftStore =
  process.argv.find((arg) => arg.startsWith("--ms"))?.split("=")[1] === "true"

const isStaging = mode === "staging"
const macCodeSignIdentity = process.env.OSX_SIGN_IDENTITY || (platform === "mas" ? undefined : "-")

const artifactRegex = /.*\.(?:exe|dmg|AppImage|zip)$/
const platformNamesMap = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
}
const ymlMapsMap = {
  darwin: "latest-mac.yml",
  linux: "latest-linux.yml",
  win32: "latest.yml",
}

const keepModules = new Set([
  "@mixmark-io",
  "@xmldom",
  "boolbase",
  "commander",
  "css-select",
  "css-what",
  "cssom",
  "defuddle",
  "domelementtype",
  "domhandler",
  "dom-serializer",
  "domutils",
  "entities",
  "font-list",
  "html-escaper",
  "htmlparser2",
  "linkedom",
  "mathml-to-latex",
  "nth-check",
  "turndown",
  "temml",
  "uhyphen",
  "vscode-languagedetection",
])
const keepLanguages = new Set(["en", "en_GB", "en-US", "en_US"])

// remove folders & files not to be included in the app
async function cleanSources(buildPath, _electronVersion, platform, _arch, callback) {
  // folders & files to be included in the app
  const appItems = new Set(["dist", "node_modules", "package.json", "resources"])

  if (platform === "darwin" || platform === "mas") {
    const frameworkResourcePath = resolve(
      buildPath,
      "../../Frameworks/Electron Framework.framework/Versions/A/Resources",
    )

    for (const file of readdirSync(frameworkResourcePath)) {
      if (file.endsWith(".lproj") && !keepLanguages.has(file.split(".")[0]!)) {
        rimrafSync(resolve(frameworkResourcePath, file))
      }
    }
  }

  // Keep only node_modules to be included in the app

  await Promise.all([
    ...(await readdir(buildPath).then((items) =>
      items.filter((item) => !appItems.has(item)).map((item) => rimraf(path.join(buildPath, item))),
    )),
    ...(await readdir(path.join(buildPath, "node_modules")).then((items) =>
      items
        .filter((item) => !keepModules.has(item))
        .map((item) => rimraf(path.join(buildPath, "node_modules", item))),
    )),
  ])

  // copy needed node_modules to be included in the app
  await Promise.all(
    Array.from(keepModules.values()).map((item) => {
      // Check is exist
      if (fs.existsSync(path.join(buildPath, "node_modules", item))) {
        // eslint-disable-next-line array-callback-return
        return
      }
      return cp(
        path.join(process.cwd(), "../../node_modules", item),
        path.join(buildPath, "node_modules", item),
        {
          recursive: true,
        },
      )
    }),
  )

  callback()
}

const noopAfterCopy = (_buildPath, _electronVersion, _platform, _arch, callback) => callback()

const ignorePattern = new RegExp(`^/node_modules/(?!${[...keepModules].join("|")})`)

const config: ForgeConfig = {
  packagerConfig: {
    name: isStaging ? "Focal Staging" : "Focal",
    appCategoryType: "public.app-category.news",
    buildVersion: process.env.BUILD_VERSION || undefined,
    appBundleId: getFocalBundleId(isStaging),
    icon: isStaging ? "resources/icon-staging" : "resources/icon",
    extraResource: ["./resources/app-update.yml"],
    protocols: [
      {
        name: "Focal",
        schemes: ["focal"],
      },
      {
        name: "Focal Legacy",
        schemes: ["folo"],
      },
      {
        name: "Focal Legacy",
        schemes: ["follow"],
      },
    ],

    afterCopy: [
      cleanSources,
      process.platform !== "win32" ? noopAfterCopy : setLanguages([...keepLanguages.values()]),
    ],
    asar: true,
    ignore: [ignorePattern],

    prune: false,
    extendInfo: {
      ITSAppUsesNonExemptEncryption: false,
    },
    osxSign: {
      optionsForFile:
        platform === "mas"
          ? (filePath) => {
              const entitlements = filePath.includes(".app/")
                ? "build/entitlements.mas.child.plist"
                : "build/entitlements.mas.plist"
              return {
                hardenedRuntime: false,
                entitlements,
              }
            }
          : () => ({
              entitlements: "build/entitlements.mac.plist",
            }),
      keychain: process.env.OSX_SIGN_KEYCHAIN_PATH,
      identity: macCodeSignIdentity,
      provisioningProfile: process.env.OSX_SIGN_PROVISIONING_PROFILE_PATH,
    },
    ...(process.env.APPLE_ID &&
      process.env.APPLE_PASSWORD &&
      process.env.APPLE_TEAM_ID && {
        osxNotarize: {
          appleId: process.env.APPLE_ID!,
          appleIdPassword: process.env.APPLE_PASSWORD!,
          teamId: process.env.APPLE_TEAM_ID!,
        },
      }),
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerDMG(
      {
        overwrite: true,
        background: "static/dmg-background.png",
        icon: "static/dmg-icon.icns",
        iconSize: 160,
        additionalDMGOptions: {
          window: {
            size: {
              width: 660,
              height: 400,
            },
          },
        },
        contents: (opts) => [
          {
            x: 180,
            y: 170,
            type: "file",
            path: (opts as any).appPath,
          },
          {
            x: 480,
            y: 170,
            type: "link",
            path: "/Applications",
          },
        ],
      },
      ["darwin", "mas"],
    ),
    new ResolvedMakerAppImage({
      config: {
        icons: [
          {
            file: isStaging ? "resources/icon-staging.png" : "resources/icon.png",
            size: 256,
          },
        ],
      },
    }),
    new MakerPKG(
      {
        name: "Focal",
        keychain: process.env.KEYCHAIN_PATH,
      },
      ["mas"],
    ),
    // Only include AppX maker for Microsoft Store builds
    ...(isMicrosoftStore
      ? [
          new MakerAppX({
            publisher: "CN=7CBBEB6A-9B0E-4387-BAE3-576D0ACA279E",
            packageDisplayName: "Focal - Local-first RSS reader",
            devCert: "build/dev.pfx",
            assets: "static/appx",
            manifest: "build/appxmanifest.xml",
            // @ts-ignore
            publisherDisplayName: "Natural Selection Labs",
            identityName: "NaturalSelectionLabs.Follow-Yourfavoritesinoneinbo",
            packageBackgroundColor: "#0066FF",
            protocol: "focal",
          }),
        ]
      : [
          new MakerSquirrel({
            name: "Focal",
            setupIcon: isStaging ? "resources/icon-staging.ico" : "resources/icon.ico",
            iconUrl: "https://github.com/nextcaicai/Focal/raw/main/apps/desktop/resources/icon.ico",
          }),
        ]),
  ],
  plugins: [
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "nextcaicai",
          name: "Focal",
        },
        draft: true,
      },
    },
  ],
  hooks: {
    postPackage: async (_config, packageResult) => {
      if (packageResult.platform !== "darwin" || !macCodeSignIdentity) {
        return
      }

      for (const outputPath of packageResult.outputPaths) {
        const appPath = path.join(outputPath, `${isStaging ? "Focal Staging" : "Focal"}.app`)
        if (!fs.existsSync(appPath)) {
          continue
        }

        execFileSync("codesign", ["--force", "--deep", "--sign", macCodeSignIdentity, appPath], {
          stdio: "inherit",
        })
      }
    },
    postMake: async (_config, makeResults) => {
      const yml: {
        version?: string
        files: {
          url: string
          sha512: string
          size: number
        }[]
        releaseDate?: string
      } = {
        version: makeResults[0]?.packageJSON?.version,
        files: [],
      }
      let basePath = ""
      const processedResults = makeResults.map((result) => {
        result.artifacts = result.artifacts
          .map((artifact) => {
            if (artifactRegex.test(artifact)) {
              if (!basePath) {
                basePath = path.dirname(artifact)
              }
              const newArtifact = `${path.dirname(artifact)}/${
                result.packageJSON.productName
              }-${result.packageJSON.version}-${
                platformNamesMap[result.platform]
              }-${result.arch}${path.extname(artifact)}`
              fs.renameSync(artifact, newArtifact)

              try {
                const fileData = fs.readFileSync(newArtifact)
                const hash = crypto.createHash("sha512").update(fileData).digest("base64")
                const { size } = fs.statSync(newArtifact)

                yml.files.push({
                  url: path.basename(newArtifact),
                  sha512: hash,
                  size,
                })
              } catch {
                console.error(`Failed to hash ${newArtifact}`)
              }
              return newArtifact
            } else if (!artifact.endsWith(".tmp")) {
              return artifact
            } else {
              return null
            }
          })
          .filter((artifact) => artifact !== null)
        return result
      })
      yml.releaseDate = new Date().toISOString()

      if (processedResults[0]?.platform && ymlMapsMap[processedResults[0].platform] && basePath) {
        const ymlPath = path.join(basePath, ymlMapsMap[processedResults[0].platform])

        const ymlStr = yaml.dump(yml, {
          lineWidth: -1,
        })
        fs.writeFileSync(ymlPath, ymlStr)

        processedResults.push({
          artifacts: [ymlPath],
          platform: processedResults[0]!.platform,
          arch: processedResults[0]!.arch,
          packageJSON: processedResults[0]!.packageJSON,
        })
      }

      return processedResults
    },
  },
}

export default config
