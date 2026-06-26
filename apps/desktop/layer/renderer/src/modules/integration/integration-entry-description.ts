import type { EntryModel } from "@follow/store/entry/types"
import { getSummary } from "@follow/store/summary/getters"

import { getActionLanguage, getGeneralSettings } from "~/atoms/settings/general"

export function getIntegrationEntryDescription(entry: EntryModel): string {
  const { summary: summaryEnabled } = getGeneralSettings()
  const actionLanguage = getActionLanguage()

  if (!summaryEnabled) {
    return entry.description || ""
  }

  const summary = getSummary(entry.id, actionLanguage)
  return summary?.readabilitySummary || summary?.summary || entry.description || ""
}
