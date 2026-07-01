import { IN_ELECTRON, LOCAL_RSS_MODE } from "@follow/shared/constants"
import type { ReactNode } from "react"
import { useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ipcServices } from "~/lib/client"
import { FOCAL_PRODUCT_NAME, FocalLogo, FocalWordmark } from "~/modules/brand/FocalLogo"
import { useDesktopReviewPromptState } from "~/modules/review-prompt/use-review-prompt-state"
import {
  openDesktopFeedbackEmail,
  openDesktopStoreReview,
  persistDesktopReviewOutcome,
  readDesktopReviewPromptState,
} from "~/modules/review-prompt/utils"
import { openAvailableUpdate } from "~/modules/upgrade/open-available-update"
import { UpdateVersionBadge } from "~/modules/upgrade/UpdateVersionBadge"
import { useAvailableUpdate } from "~/modules/upgrade/use-available-update"

import { SettingRow, settingRowDescriptionClass, settingRowLabelClass } from "../control"
import { SettingItemGroup, SettingSection, SettingSectionGroup } from "../section"

export const SettingAbout = () => {
  const { t } = useTranslation("settings")
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const availableUpdate = useAvailableUpdate()
  const { distribution, platform, rateTarget, storageKey, userId } = useDesktopReviewPromptState()

  const handleCheckForUpdates = async () => {
    if (isCheckingUpdate) return

    if (availableUpdate && openAvailableUpdate()) {
      return
    }

    setIsCheckingUpdate(true)
    const toastId = toast.loading(t("about.checkingForUpdates"))

    try {
      const result = await ipcServices?.app.checkForUpdates()

      if (result?.error) {
        toast.error(t("about.updateCheckFailed"), { id: toastId })
      } else if (result?.hasUpdate) {
        toast.success(t("about.updateAvailable"), { id: toastId })
      } else {
        toast.info(t("about.noUpdateAvailable"), { id: toastId })
      }
    } catch {
      toast.error(t("about.updateCheckFailed"), { id: toastId })
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const handleRateFocal = async () => {
    if (!rateTarget) {
      return
    }

    persistDesktopReviewOutcome({
      appVersion: APP_VERSION,
      distribution,
      outcome: "positive_store_redirect",
      platform,
      source: "manual",
      state: readDesktopReviewPromptState(storageKey),
      storageKey,
    })
    await openDesktopStoreReview(rateTarget)
  }

  const handleSendFeedback = async () => {
    persistDesktopReviewOutcome({
      appVersion: APP_VERSION,
      distribution,
      outcome: "negative_feedback",
      platform,
      source: "manual",
      state: readDesktopReviewPromptState(storageKey),
      storageKey,
    })
    await openDesktopFeedbackEmail({ distribution, userId })
  }

  return (
    <div className="mx-auto mt-6 max-w-3xl">
      {/* Header Section */}
      <div className="mb-8 px-2 text-center">
        <div className="mb-4 flex justify-center">
          <FocalLogo className="size-20 rounded-[1.75rem]" />
        </div>
        <h1 className="mt-3 flex justify-center">
          <FocalWordmark className="text-3xl" />
        </h1>
        <p className="mt-1 text-xs text-text-tertiary">v{APP_VERSION}</p>
        <p className="mt-2 text-sm text-text-secondary">
          {t("about.licenseInfo", {
            appName: FOCAL_PRODUCT_NAME,
            currentYear: new Date().getFullYear(),
          })}
        </p>
      </div>

      <SettingSectionGroup>
        <SettingSection>
          {IN_ELECTRON && (
            <AboutActionRow
              label={t("about.checkForUpdates")}
              description={t("about.updateDescription")}
              disabled={isCheckingUpdate}
              onAction={handleCheckForUpdates}
              trailing={
                availableUpdate ? (
                  <UpdateVersionBadge
                    label={t("about.newVersion")}
                    version={availableUpdate.version}
                    onClick={openAvailableUpdate}
                  />
                ) : null
              }
              actionIcon={
                isCheckingUpdate ? (
                  <i className="i-focal-loading-3 animate-spin text-base" />
                ) : (
                  <i className="i-focal-arrow-right-up text-base transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                )
              }
            />
          )}
          {!LOCAL_RSS_MODE && rateTarget && (
            <AboutActionRow
              label={t("about.rateFocal")}
              description={t("about.rateFocalDescription")}
              onAction={() => {
                void handleRateFocal()
              }}
              actionIcon={
                <i className="i-focal-star text-base transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              }
            />
          )}
          {!LOCAL_RSS_MODE && (
            <AboutActionRow
              label={t("about.sendFeedback")}
              description={t("about.sendFeedbackDescription")}
              onAction={() => {
                void handleSendFeedback()
              }}
              actionIcon={
                <i className="i-focal-mail text-base transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              }
            />
          )}
          <SettingItemGroup>
            <div className="flex min-h-8 flex-col justify-center gap-0.5">
              <div className={settingRowLabelClass}>{t("about.resources")}</div>
              <p className={settingRowDescriptionClass}>
                <Trans
                  ns="settings"
                  i18nKey="about.feedbackInfo"
                  values={{
                    appName: FOCAL_PRODUCT_NAME,
                  }}
                  components={{
                    OpenIssueLink: (
                      <a
                        className="text-accent hover:underline"
                        href="https://github.com/nextcaicai/Focal"
                        target="_blank"
                        rel="noreferrer"
                      >
                        open an issue
                      </a>
                    ),
                  }}
                />
              </p>
            </div>
          </SettingItemGroup>
        </SettingSection>
      </SettingSectionGroup>
    </div>
  )
}

const AboutActionRow = ({
  actionIcon,
  description,
  disabled,
  label,
  onAction,
  trailing,
}: {
  actionIcon: ReactNode
  description: ReactNode
  disabled?: boolean
  label: string
  onAction: () => void
  trailing?: ReactNode
}) => (
  <SettingItemGroup>
    <SettingRow label={label} description={description}>
      <div className="flex items-center gap-2">
        {trailing}
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          aria-label={label}
          className="group flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-fill-secondary hover:text-accent disabled:pointer-events-none disabled:opacity-60"
        >
          {actionIcon}
        </button>
      </div>
    </SettingRow>
  </SettingItemGroup>
)
