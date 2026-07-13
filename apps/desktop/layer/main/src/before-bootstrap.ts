import { app, protocol } from "electron"

import { migrateLegacyDevUserData } from "~/lib/dev-user-data"

const e2eUserDataDir = process.env.FOCAL_E2E_USER_DATA_DIR

if (e2eUserDataDir) {
  app.setPath("userData", e2eUserDataDir)
} else if (import.meta.env.DEV) {
  app.setPath("userData", migrateLegacyDevUserData(app.getPath("appData")))
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      bypassCSP: true,
      supportFetchAPI: true,
      secure: true,
    },
  },
])
