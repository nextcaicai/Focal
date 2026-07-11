import { stopPropagation } from "@follow/utils/dom"
import { memo } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router"

export const EmptyFeedList = memo(() => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const handleClick = (e: React.MouseEvent) => {
    stopPropagation(e)
    if (location.pathname !== "/discover") {
      navigate("/discover")
    }
  }

  // Same absolute full-area center as EntryEmptyList so height aligns with mid/content empties.
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] -mt-6 flex flex-col items-center justify-center gap-2 font-normal text-zinc-400">
      <button
        type="button"
        className="pointer-events-auto flex cursor-menu flex-col items-center justify-center gap-2"
        onClick={handleClick}
      >
        {/* Same size as the header discover "+" (size-5). */}
        <i className="i-focal-add size-5" />
        <span className="text-balance text-center text-base">
          {t("sidebar.empty_feeds_prompt")}
        </span>
      </button>
    </div>
  )
})
EmptyFeedList.displayName = "EmptyFeedList"
