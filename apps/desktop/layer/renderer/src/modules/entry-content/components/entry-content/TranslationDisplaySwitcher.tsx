import { SegmentGroup, SegmentItem } from "@follow/components/ui/segment/index.js"
import { cn } from "@follow/utils/utils"
import { memo } from "react"
import { useTranslation } from "react-i18next"

import type { TranslationDisplayMode } from "../../utils/translation-display"

interface TranslationDisplaySwitcherProps {
  value: TranslationDisplayMode
  onValueChange: (value: TranslationDisplayMode) => void
  className?: string
}

export const TranslationDisplaySwitcher = memo(
  ({ value, onValueChange, className }: TranslationDisplaySwitcherProps) => {
    const { t } = useTranslation()

    return (
      <div
        className={cn("flex flex-wrap items-center gap-3 text-sm text-text-secondary", className)}
      >
        <div className="flex items-center gap-1.5 font-medium">
          <i className="i-focal-translate-2 size-4" />
          <span>{t("entry_content.translation_display.ai_translation")}</span>
        </div>
        <SegmentGroup
          value={value}
          onValueChanged={(nextValue) => {
            onValueChange(nextValue as TranslationDisplayMode)
          }}
          className="h-8 rounded-full bg-fill-secondary p-0.5"
        >
          <SegmentItem
            value="translation-only"
            label={t("entry_content.translation_display.translation_only")}
            className="rounded-full px-3 text-xs"
          />
          <SegmentItem
            value="bilingual"
            label={t("entry_content.translation_display.bilingual")}
            className="rounded-full px-3 text-xs"
          />
        </SegmentGroup>
      </div>
    )
  },
)
