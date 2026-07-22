import { useTranslation } from "react-i18next"

import { useRouteParams } from "~/hooks/biz/useRouteParams"

import { useRecommendedTimelineSession } from "../recommended-timeline-session"

export const RecommendedTimelineUpdateNotice = ({ onView }: { onView: () => void }) => {
  const { smartFeed } = useRouteParams()
  const { t } = useTranslation()
  const { updatePending } = useRecommendedTimelineSession()

  if (smartFeed !== "recommended" || !updatePending) return null

  return (
    <div className="px-3 pb-2" aria-live="polite">
      <button
        type="button"
        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-blue/20 bg-blue/10 px-3 text-xs font-medium text-blue transition-colors hover:bg-blue/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40"
        onClick={(event) => {
          event.stopPropagation()
          onView()
        }}
      >
        <i className="i-focal-refresh-2 size-3.5" aria-hidden />
        <span>{t("entry_list_header.recommendations_updated_action")}</span>
      </button>
    </div>
  )
}
