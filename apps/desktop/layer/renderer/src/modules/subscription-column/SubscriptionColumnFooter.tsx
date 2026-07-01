import { IN_ELECTRON, LOCAL_RSS_MODE } from "@follow/shared/constants"
import { cn } from "@follow/utils/utils"
import { memo } from "react"
import { useTranslation } from "react-i18next"

import { useLocalRssRefreshState } from "~/modules/local-rss/refresh-scheduler"
import { useSettingModal } from "~/modules/settings/modal/use-setting-modal-hack"
import { openAvailableUpdate } from "~/modules/upgrade/open-available-update"
import { UpdateVersionBadge } from "~/modules/upgrade/UpdateVersionBadge"
import { useAvailableUpdate } from "~/modules/upgrade/use-available-update"

export const SubscriptionColumnFooter = memo(() => {
  const showSettings = useSettingModal()
  const { t } = useTranslation()
  const { isRefreshing } = useLocalRssRefreshState()
  const availableUpdate = useAvailableUpdate()

  return (
    <div
      className="relative z-20 shrink-0 bg-[rgb(247,247,247)] px-3 pb-2 pt-2 dark:bg-sidebar"
      onClick={(event) => {
        event.stopPropagation()
      }}
    >
      {LOCAL_RSS_MODE && isRefreshing ? (
        <div className="mb-2 flex min-h-5 items-center gap-1.5 px-1 text-xs text-text-tertiary">
          <i className="i-focal-loading-3 size-3.5 shrink-0 animate-spin" />
          <span>{t("sidebar.local_rss_status_refreshing")}</span>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <FooterAction
          data-testid="subscription-settings-trigger"
          icon="i-focal-settings-7"
          label={t("user_button.preferences")}
          align="left"
          className="min-w-0 flex-1"
          onClick={() => showSettings()}
        />
        {IN_ELECTRON && availableUpdate ? (
          <UpdateVersionBadge
            label={availableUpdate.version ? undefined : t("about.newVersion", { ns: "settings" })}
            version={availableUpdate.version}
            onClick={openAvailableUpdate}
          />
        ) : null}
      </div>
    </div>
  )
})

SubscriptionColumnFooter.displayName = "SubscriptionColumnFooter"

const FooterAction = ({
  icon,
  label,
  active,
  align = "center",
  className,
  onClick,
  "data-testid": dataTestId,
}: {
  icon: string
  label: string
  active?: boolean
  align?: "left" | "center" | "right"
  className?: string
  onClick: () => void
  "data-testid": string
}) => (
  <button
    type="button"
    data-testid={dataTestId}
    aria-pressed={active}
    className={cn(
      "flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium text-text-secondary",
      "transition-colors duration-200 hover:bg-theme-item-hover hover:text-text",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/30",
      align === "left" && "justify-start",
      align === "center" && "justify-center",
      align === "right" && "justify-end",
      active && "bg-theme-item-active text-text",
      className,
    )}
    onClick={onClick}
  >
    <i className={cn(icon, "size-5 shrink-0")} />
    <span className="truncate">{label}</span>
  </button>
)
