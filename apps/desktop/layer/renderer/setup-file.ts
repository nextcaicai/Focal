// @ts-nocheck
import "fake-indexeddb/auto"

import { enableMapSet } from "immer"

globalThis.window = {
  location: new URL("https://example.com"),
  __dbIsReady: true,
  addEventListener: () => {},
  removeEventListener: () => {},
  get navigator() {
    return globalThis.navigator
  },
}

if (!globalThis.navigator) {
  globalThis.navigator = {
    onLine: true,
    userAgent: "node",
  }
}
enableMapSet()
