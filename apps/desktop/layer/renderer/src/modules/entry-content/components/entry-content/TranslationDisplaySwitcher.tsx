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
      <div className={cn("flex items-center gap-2", className)}>
        <SegmentGroup
          value={value}
          onValueChanged={(nextValue) => {
            onValueChange(nextValue as TranslationDisplayMode)
          }}
        >
          <SegmentItem
            value="translation-only"
            label={t("entry_content.translation_display.translation_only")}
          />
          <SegmentItem value="bilingual" label={t("entry_content.translation_display.bilingual")} />
        </SegmentGroup>
      </div>
    )
  },
)
