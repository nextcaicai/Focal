import { isFreeRole } from "@follow/constants"
import { LOCAL_RSS_MODE } from "@follow/shared/constants"
import { useEntry, usePrefetchEntryDetail } from "@follow/store/entry/hooks"
import {
  useEntryTranslation,
  useEntryTranslationDraft,
  usePrefetchEntryTranslation,
} from "@follow/store/translation/hooks"
import { useUserRole } from "@follow/store/user/hooks"
import { tracker } from "@follow/tracker"
import { createElement, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { useShowAITranslation } from "~/atoms/ai-translation"
import { useEntryIsInReadability, useEntryIsInReadabilitySuccess } from "~/atoms/readability"
import { useActionLanguage } from "~/atoms/settings/general"
import { useModalStack } from "~/components/ui/modal/stacked/hooks"

import { ImageGalleryContent } from "./components/ImageGalleryContent"
import type { TranslationDisplayMode } from "./utils/translation-display"
import { assembleTranslationDisplayContent } from "./utils/translation-display"

export const useGalleryModal = () => {
  const { present } = useModalStack()
  const { t } = useTranslation()
  return useCallback(
    (entryId?: string) => {
      if (!entryId) {
        // this should not happen unless there is a bug in the code
        toast.error(t("entry_actions.invalid_feed_id"))
        return
      }
      tracker.entryContentHeaderImageGalleryClick({
        feedId: entryId,
      })
      present({
        title: t("entry_actions.image_gallery"),
        content: () => createElement(ImageGalleryContent, { entryId }),
        max: true,
        clickOutsideToDismiss: true,
      })
    },
    [present, t],
  )
}

export const useEntryContent = (
  entryId: string,
  options?: {
    translationDisplayMode?: TranslationDisplayMode
  },
) => {
  const entry = useEntry(entryId, (state) => {
    const { inboxHandle, content, readabilityContent } = state
    return { inboxId: inboxHandle, content, readabilityContent }
  })
  const { error, data, isPending } = usePrefetchEntryDetail(entryId)

  const isInReadabilityMode = useEntryIsInReadability(entryId)
  const isReadabilitySuccess = useEntryIsInReadabilitySuccess(entryId)

  const enableTranslation = useShowAITranslation(entryId)
  const userRole = useUserRole()
  const shouldPrefetchTranslation =
    enableTranslation && (!LOCAL_RSS_MODE ? !isFreeRole(userRole) : true)
  const actionLanguage = useActionLanguage()
  const contentTarget = isReadabilitySuccess ? "readabilityContent" : "content"
  const translationDisplayMode = options?.translationDisplayMode ?? "translation-only"
  const contentTranslated = useEntryTranslation({
    entryId,
    language: actionLanguage,
    enabled: enableTranslation,
  })
  const translationDraft = useEntryTranslationDraft({
    entryId,
    language: actionLanguage,
    enabled: enableTranslation,
    field: contentTarget,
  })
  usePrefetchEntryTranslation({
    entryIds: [entryId],
    enabled: shouldPrefetchTranslation,
    language: actionLanguage,
    withContent: true,
    target: contentTarget,
    mode: "translation-only",
    fields: LOCAL_RSS_MODE ? [contentTarget] : undefined,
  })

  return useMemo(() => {
    const entryContent = isInReadabilityMode
      ? entry?.readabilityContent
      : (entry?.content ?? data?.content)
    const translatedContent = isInReadabilityMode
      ? contentTranslated?.readabilityContent
      : contentTranslated?.content
    const content = enableTranslation
      ? assembleTranslationDisplayContent({
          entryId,
          target: contentTarget,
          sourceContent: entryContent,
          translatedContent,
          draft: translationDraft,
          mode: translationDisplayMode,
        })
      : entryContent
    return {
      content,
      error,
      isPending,
    }
  }, [
    contentTranslated?.content,
    contentTranslated?.readabilityContent,
    data?.content,
    enableTranslation,
    entry?.content,
    error,
    contentTarget,
    entryId,
    isInReadabilityMode,
    isPending,
    entry?.readabilityContent,
    translationDisplayMode,
    translationDraft,
  ])
}

export const useEntryMediaInfo = (entryId: string) => {
  return useEntry(entryId, (entry) =>
    Object.fromEntries(
      entry?.media
        ?.filter((m) => m.type === "photo")
        .map((cur) => [
          cur.url,
          {
            width: cur.width,
            height: cur.height,
          },
        ]) ?? [],
    ),
  )
}
