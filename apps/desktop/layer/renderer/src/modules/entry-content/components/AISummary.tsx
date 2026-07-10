import { MotionButtonBase } from "@follow/components/ui/button/index.js"
import { useEntry } from "@follow/store/entry/hooks"
import { usePrefetchSummary, useSummary } from "@follow/store/summary/hooks"
import { cn } from "@follow/utils/utils"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { useShowAISummary } from "~/atoms/ai-summary"
import { useEntryIsInReadabilitySuccess } from "~/atoms/readability"
import { AIChatPanelStyle, useAIChatPanelStyle, useAIPanelVisibility } from "~/atoms/settings/ai"
import { useActionLanguage } from "~/atoms/settings/general"
import { AISummaryCardBase } from "~/components/ui/ai-summary-card"

import { openEntryAIChat } from "../utils/open-ai-chat"

export function AISummary({ entryId }: { entryId: string }) {
  const { t } = useTranslation()
  const summarySetting = useEntry(entryId, (state) => state.settings?.summary)
  const isInReadabilitySuccess = useEntryIsInReadabilitySuccess(entryId)
  const showAISummary = useShowAISummary(summarySetting)

  const actionLanguage = useActionLanguage()
  const target = isInReadabilitySuccess ? "readabilityContent" : "content"

  // Existing summary from store (ingest pipeline or prior generate). Display only — no auto BYOK.
  const cached = useSummary(entryId, actionLanguage)
  const cachedText =
    target === "readabilityContent"
      ? cached?.readabilitySummary || cached?.summary
      : cached?.summary || cached?.readabilitySummary

  // Button-triggered generation only (P0: open article does not auto-spend tokens).
  const [requested, setRequested] = useState(false)

  const summary = usePrefetchSummary({
    actionLanguage,
    entryId,
    target,
    enabled: showAISummary && requested,
  })

  const displayContent = summary.data ?? cachedText ?? null
  const isLoading = requested && summary.isLoading

  const aiChatPanelStyle = useAIChatPanelStyle()
  const isAIPanelVisible = useAIPanelVisibility()

  const shouldShowAskAI =
    (aiChatPanelStyle === AIChatPanelStyle.Floating && !isAIPanelVisible) ||
    aiChatPanelStyle === AIChatPanelStyle.Fixed

  const handleAskAI = () => {
    openEntryAIChat()
  }

  const handleGenerate = useCallback(() => {
    setRequested(true)
  }, [])

  if (!showAISummary) {
    return null
  }

  return (
    <AISummaryCardBase
      content={displayContent}
      isLoading={isLoading}
      className="my-8"
      title={t("entry_content.ai_summary")}
      showAskAIButton={shouldShowAskAI}
      onAskAI={handleAskAI}
      error={summary.error}
      emptyContent={
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-text-secondary">{t("entry_content.ai_summary_empty_hint")}</p>
          <MotionButtonBase
            onClick={handleGenerate}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
              "bg-gradient-to-r from-purple-500/10 to-blue-500/10",
              "border border-purple-200/30 dark:border-purple-800/30",
              "text-purple-600 dark:text-purple-400",
              "hover:from-purple-500/20 hover:to-blue-500/20",
              "transition-all duration-200",
            )}
          >
            <i className="i-focal-ai text-base" />
            <span>{t("entry_content.generate_ai_summary")}</span>
          </MotionButtonBase>
        </div>
      }
    />
  )
}
