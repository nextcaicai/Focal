import { tracker } from "@follow/tracker"

import { getUpdaterStatus, setUpdaterStatus } from "~/atoms/updater"
import { ipcServices } from "~/lib/client"

export const openAvailableUpdate = () => {
  const status = getUpdaterStatus()
  if (!status) {
    return false
  }

  tracker.updateRestart({
    type: status.type,
  })

  switch (status.type) {
    case "app": {
      ipcServices?.app.quitAndInstall()
      break
    }
    case "renderer": {
      ipcServices?.app.rendererUpdateReload()
      break
    }
    case "pwa": {
      status.finishUpdate?.()
      break
    }
    case "distribution": {
      if (status.targetUrl) {
        if (ipcServices?.app.openExternal) {
          void ipcServices.app.openExternal(status.targetUrl)
        } else {
          window.open(status.targetUrl, "_blank")
        }
      }
      break
    }
    default: {
      return false
    }
  }

  setUpdaterStatus(null)
  return true
}
