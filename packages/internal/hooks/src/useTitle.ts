import { IN_ELECTRON } from "@follow/shared/constants"
import { useEffect } from "react"

declare const APP_NAME: string
const titleTemplate = IN_ELECTRON ? `%s` : `%s | ${APP_NAME}`

export const useTitle = (title?: string | null) => {
  useEffect(() => {
    if (!title) return

    const previousTitle = document.title
    document.title = titleTemplate.replace("%s", title)
    return () => {
      document.title = previousTitle
    }
  }, [title])
}
