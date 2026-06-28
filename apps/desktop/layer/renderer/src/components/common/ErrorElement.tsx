import { Button } from "@follow/components/ui/button/index.js"
import { exportDB } from "@follow/database/db"
import { callWindowExposeRenderer } from "@follow/shared/bridge"
import { IN_ELECTRON } from "@follow/shared/constants"
import { tracker } from "@follow/tracker"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router"
import { toast } from "sonner"

import { removeAppSkeleton } from "~/lib/app"
import { attachOpenInEditor } from "~/lib/dev"
import { getNewIssueUrl } from "~/lib/issues"
import { clearLocalPersistStoreData } from "~/store/utils/clear"

import { PoweredByFooter } from "./PoweredByFooter"

const confirmDestructive = async (title: string, message: string): Promise<boolean> => {
  if (IN_ELECTRON) {
    try {
      return await callWindowExposeRenderer().dialog.ask({ title, message })
    } catch {
      // Fall back to browser confirm if the bridge is unavailable.
    }
  }
  return window.confirm(`${title}\n\n${message}`)
}

export function ErrorElement() {
  const { t } = useTranslation("common")
  const error = useRouteError()
  const navigate = useNavigate()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : JSON.stringify(error)
  const stack = error instanceof Error ? error.stack : null

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    removeAppSkeleton()
  }, [])

  useEffect(() => {
    console.error("Error handled by React Router default ErrorBoundary:", error)
    void tracker.manager.captureException(error, {
      source: "desktop_router_error_element",
    })
  }, [error])

  const reloadRef = useRef(false)
  if (
    message.startsWith("Failed to fetch dynamically imported module") &&
    window.sessionStorage.getItem("reload") !== "1"
  ) {
    if (reloadRef.current) return null
    toast.info(t("error_screen.web_app_updated_reload"))
    window.sessionStorage.setItem("reload", "1")
    window.location.reload()
    reloadRef.current = true
    return null
  }

  const handleReload = () => {
    sessionStorage.removeItem("reload")
    navigate("/")
    window.location.reload()
  }

  const handleBackToHome = () => {
    sessionStorage.removeItem("reload")
    window.location.href = "/"
  }

  const handleExportAndReset = async () => {
    setIsExporting(true)
    try {
      await exportDB()
    } catch (exportError) {
      console.error("Failed to export database before reset:", exportError)
      toast.error(t("error_screen.export_failed"))
      setIsExporting(false)
      return
    }

    const confirmed = await confirmDestructive(
      t("error_screen.reset_confirm_title"),
      t("error_screen.reset_confirm_message"),
    )

    if (!confirmed) {
      setIsExporting(false)
      return
    }

    await clearLocalPersistStoreData()
    window.location.href = "/"
  }

  return (
    <div className="m-auto flex min-h-full max-w-prose select-text flex-col p-8 pt-24">
      <div className="drag-region fixed inset-x-0 top-0 h-12" />
      <div className="center flex flex-col">
        <i className="i-focal-bug size-12 text-red-400" />
        <h2 className="mb-4 mt-12 text-2xl">
          {t("error_screen.app_encountered_error", { appName: APP_NAME })}
        </h2>
      </div>
      <h3 className="text-xl">{message}</h3>
      {import.meta.env.DEV && stack ? (
        <pre className="mt-4 max-h-48 cursor-text overflow-auto whitespace-pre-line rounded-md bg-red-50 p-4 text-left font-mono text-sm text-red-600">
          {attachOpenInEditor(stack)}
        </pre>
      ) : null}

      <p className="my-8">{t("error_screen.temporary_problem", { appName: APP_NAME })}</p>

      <div className="center flex-col gap-4">
        <div className="center gap-4">
          <Button variant="outline" onClick={handleBackToHome}>
            {t("error_screen.back_to_home")}
          </Button>
          <Button onClick={handleReload}>{t("error_screen.reload")}</Button>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="text-xs text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline"
        >
          {t("error_screen.advanced_options")}
        </button>

        {showAdvanced && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-4">
            <p className="max-w-xs text-center text-xs text-text-secondary">
              {t("error_screen.export_and_reset_description")}
            </p>
            <Button
              variant="outline"
              onClick={handleExportAndReset}
              disabled={isExporting}
              buttonClassName="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950"
            >
              {isExporting
                ? t("error_screen.exporting")
                : t("error_screen.export_and_reset_database")}
            </Button>
          </div>
        )}
      </div>

      <FeedbackIssue message={message} stack={stack} error={error as Error} />
      <div className="grow" />

      <PoweredByFooter />
    </div>
  )
}

export const FeedbackIssue = (_props: {
  message: string
  stack: string | null | undefined
  error?: unknown
}) => {
  const { t } = useTranslation("common")

  return (
    <p className="mt-8">
      {t("error_screen.feedback_issue")}
      <a
        className="ml-2 cursor-pointer text-accent duration-200 hover:text-accent/90"
        href={getNewIssueUrl({
          template: "bug_report.yml",
        })}
        target="_blank"
        rel="noreferrer"
      >
        {t("error_screen.submit_issue")}
      </a>
    </p>
  )
}
