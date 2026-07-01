import { useMemo } from "react"

import type { UpdaterStatusAtom } from "~/atoms/updater"
import { useUpdaterStatus } from "~/atoms/updater"

export type AvailableUpdate = {
  version: string | null
}

export const resolveAvailableUpdate = (
  updaterStatus: UpdaterStatusAtom,
): AvailableUpdate | null => {
  if (!updaterStatus) {
    return null
  }

  switch (updaterStatus.type) {
    case "distribution": {
      return {
        version: updaterStatus.storeVersion,
      }
    }
    case "app":
    case "renderer": {
      return {
        version: null,
      }
    }
    default: {
      return null
    }
  }
}

export const useAvailableUpdate = (): AvailableUpdate | null => {
  const updaterStatus = useUpdaterStatus()
  return useMemo(() => resolveAvailableUpdate(updaterStatus), [updaterStatus])
}
