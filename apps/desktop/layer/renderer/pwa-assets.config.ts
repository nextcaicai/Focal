import type { Preset } from "@vite-pwa/assets-generator/config"
import { defineConfig } from "@vite-pwa/assets-generator/config"

const focalBlue = {
  r: 0,
  g: 78,
  b: 253,
  alpha: 1,
}

const minimal2023Preset: Preset = {
  transparent: {
    sizes: [64, 192, 512],
    favicons: [[48, "favicon.ico"]],
    padding: 0.05,
    resizeOptions: {
      fit: "contain",
      background: focalBlue,
    },
  },
  maskable: {
    sizes: [512],
    padding: 0.1,
    resizeOptions: {
      fit: "contain",
      background: focalBlue,
    },
  },
  apple: {
    sizes: [180],
    padding: 0,
    resizeOptions: {
      fit: "contain",
      background: focalBlue,
    },
  },
}

export default defineConfig({
  headLinkOptions: {
    preset: "2023",
  },
  preset: minimal2023Preset,
  images: ["public/icon.svg"],
})
