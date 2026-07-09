import type { Ref } from "react"

import type { TranslationDisplayMode } from "../../utils/translation-display"

/**
 * Shared props interface for all entry content layout components
 */
export interface EntryLayoutProps {
  entryId: string
  compact?: boolean
  noMedia?: boolean
  translation?: {
    content?: string
    title?: string
  }
  isTranslationEnabled?: boolean
  translationDisplayMode?: TranslationDisplayMode
  onTranslationDisplayModeChange?: (mode: TranslationDisplayMode) => void
  translationDisplayControlRef?: Ref<HTMLDivElement | null>
  showFloatingTranslationDisplayToggle?: boolean
}
