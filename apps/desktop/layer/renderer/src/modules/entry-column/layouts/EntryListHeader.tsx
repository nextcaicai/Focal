import { ActionButton, MotionButtonBase } from "@follow/components/ui/button/index.js"
import { DividerVertical } from "@follow/components/ui/divider/index.js"
import { EllipsisHorizontalTextWithTooltip } from "@follow/components/ui/typography/index.js"
import { FeedViewType, getView } from "@follow/constants"
import { LOCAL_RSS_MODE } from "@follow/shared/constants"
import { DEFAULT_SUMMARIZE_TIMELINE_SHORTCUT_ID } from "@follow/shared/settings/defaults"
import { useAllCollectionEntryList, useCollectionEntryList } from "@follow/store/collection/hooks"
import { useEntryStore } from "@follow/store/entry/store"
import {
  useEmbeddingCoverageStats,
  useEmbeddingProcessingBusy,
} from "@follow/store/entry-embedding/hooks"
import { getFeedById } from "@follow/store/feed/getter"
import { folderFeedsByFeedIdSelector } from "@follow/store/subscription/selectors"
import { useSubscriptionStore } from "@follow/store/subscription/store"
import {
  useUnreadAll,
  useUnreadById,
  useUnreadByIds,
  useUnreadByListId,
  useUnreadByView,
} from "@follow/store/unread/hooks"
import { useIsLoggedIn } from "@follow/store/user/hooks"
import { stopPropagation } from "@follow/utils/dom"
import { clsx, cn } from "@follow/utils/utils"
import { useAtom, useAtomValue } from "jotai"
import type { FC, MouseEvent } from "react"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router"

import {
  clearLibrarySearch,
  useLibrarySearchActive,
  useLibrarySearchSession,
} from "~/atoms/library-search"
import { previewBackPath } from "~/atoms/preview"
import { useAISettingKey } from "~/atoms/settings/ai"
import { useGeneralSettingKey } from "~/atoms/settings/general"
import { useSubscriptionColumnShow } from "~/atoms/sidebar"
import { ROUTE_ENTRY_PENDING } from "~/constants"
import { useFeature } from "~/hooks/biz/useFeature"
import { useFollow } from "~/hooks/biz/useFollow"
import { useNavigateEntry } from "~/hooks/biz/useNavigateEntry"
import { getRouteParams, useRouteParams } from "~/hooks/biz/useRouteParams"
import { useLoginModal } from "~/hooks/common"
import { useSendAIShortcut } from "~/modules/ai-chat/hooks/useSendAIShortcut"
import { COMMAND_ID } from "~/modules/command/commands/id"
import { useRunCommandFn } from "~/modules/command/hooks/use-command"
import { useCommandShortcut } from "~/modules/command/hooks/use-command-binding"
import { EntryHeader } from "~/modules/entry-content/components/entry-header"
import { FeedIcon } from "~/modules/feed/feed-icon"
import { useFeedHeaderIcon, useFeedHeaderTitle } from "~/store/feed/hooks"
import { useLibrarySearchEntryIds } from "~/store/search/library-search"

import { aiTimelineEnabledAtom } from "../atoms/ai-timeline"
import { recommendedTimelineEnabledAtom } from "../atoms/recommended-timeline"
import { MarkAllReadButton } from "../components/mark-all-button"
import { useIsPreviewFeed } from "../hooks/useIsPreviewFeed"
import { useEntryRootState } from "../store/EntryColumnContext"
import { AppendTaildingDivider } from "./AppendTaildingDivider"
import { SwitchToMasonryButton } from "./buttons/SwitchToMasonryButton"

export const EntryListHeader: FC = () => {
  const { entryId, view } = useRouteParams()
  const { t } = useTranslation()
  const navigateEntry = useNavigateEntry()
  const librarySearchActive = useLibrarySearchActive()
  const librarySearchSession = useLibrarySearchSession()
  const librarySearchCount = useLibrarySearchEntryIds().length
  const embeddingCoverage = useEmbeddingCoverageStats()
  const embeddingBusy = useEmbeddingProcessingBusy()
  const embeddingSettings = useAISettingKey("embedding")
  const embeddingEnabled = LOCAL_RSS_MODE && (embeddingSettings?.enabled ?? false)

  const unreadOnly = useGeneralSettingKey("unreadOnly")
  const [aiTimelineEnabled, setAiTimelineEnabled] = useAtom(aiTimelineEnabledAtom)
  const [recommendedTimelineEnabled, setRecommendedTimelineEnabled] = useAtom(
    recommendedTimelineEnabledAtom,
  )
  const aiEnabled = useFeature("ai")

  const isPreview = useIsPreviewFeed()
  const isWideMode = !!getView(view)?.wideMode

  const headerTitle = useFeedHeaderTitle()
  const feedIcon = useFeedHeaderIcon()

  const feedColumnShow = useSubscriptionColumnShow()
  const toggleUnreadOnlyShortcut = useCommandShortcut(COMMAND_ID.timeline.unreadOnly)
  const runCmdFn = useRunCommandFn()
  const currentTimelineUnreadCount = useCurrentTimelineUnreadCount()
  const hasCurrentTimelineUnread = currentTimelineUnreadCount > 0
  const disableUnreadOnlyToggle = !unreadOnly && !hasCurrentTimelineUnread

  const handleClearLibrarySearch = useCallback(() => {
    const previous = librarySearchSession.previousScope
    clearLibrarySearch()
    if (previous?.feedId) {
      navigateEntry({ feedId: previous.feedId, entryId: null })
    }
  }, [librarySearchSession.previousScope, navigateEntry])

  const semanticIndexLabel = (() => {
    if (!embeddingEnabled || embeddingCoverage.eligibleCount === 0) return null
    if (embeddingBusy || embeddingCoverage.backlogCount > 0) {
      return t("search.semantic_index.building", {
        covered: embeddingCoverage.coveredCount,
        total: embeddingCoverage.eligibleCount,
      })
    }
    return t("search.semantic_index.ready", {
      covered: embeddingCoverage.coveredCount,
      total: embeddingCoverage.eligibleCount,
    })
  })()

  const searchTitleInfo = librarySearchActive && (
    <div
      className={clsx(
        // Match normal feed title block: same left offset as titleInfo (-ml-3 under pl-7).
        "no-drag-region pointer-events-auto flex min-w-0 flex-1 flex-col justify-center overflow-hidden",
        "-ml-3",
      )}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
    >
      <div className="flex min-w-0 items-center gap-2">
        <i className="i-lucide-search size-4 shrink-0 text-text-secondary" />
        <EllipsisHorizontalTextWithTooltip className="min-w-0 flex-1 truncate text-sm font-semibold">
          {t("search.results_title", {
            query: librarySearchSession.query.trim(),
            count: librarySearchCount,
          })}
        </EllipsisHorizontalTextWithTooltip>
      </div>
      {semanticIndexLabel ? (
        <span className="pl-6 text-xs text-text-tertiary" title={semanticIndexLabel}>
          {semanticIndexLabel}
        </span>
      ) : null}
    </div>
  )

  const titleInfo = !!headerTitle && (
    <div className={clsx("flex min-w-0 flex-1 flex-col justify-center overflow-hidden", "-ml-3")}>
      <div className="flex min-w-0 items-center">
        {feedIcon && <FeedIcon target={feedIcon} fallback size={16} className="mr-2 shrink-0" />}
        <EllipsisHorizontalTextWithTooltip className="min-w-0 flex-1 truncate text-sm font-semibold">
          {headerTitle}
        </EllipsisHorizontalTextWithTooltip>
      </div>
      <span className="pl-0.5 text-xs text-text-tertiary">
        {currentTimelineUnreadCount} {t("entry_list_header.unread")}
      </span>
    </div>
  )
  const titleStyleBasedView = {
    [FeedViewType.All]: "pl-7",
    [FeedViewType.Articles]: "pl-7",
    [FeedViewType.Pictures]: "pl-7",
    [FeedViewType.Videos]: "pl-7",
    [FeedViewType.SocialMedia]: "px-5",
    [FeedViewType.Audios]: "pl-6",
    [FeedViewType.Notifications]: "pl-6",
  }

  const { isScrolledBeyondThreshold } = useEntryRootState()
  const isScrolledBeyondThresholdValue = useAtomValue(isScrolledBeyondThreshold)
  const { sendAIShortcut } = useSendAIShortcut()
  const summarizeTimeline = useCallback(() => {
    void sendAIShortcut({
      shortcutId: DEFAULT_SUMMARIZE_TIMELINE_SHORTCUT_ID,
      ensureNewChat: true,
    })
  }, [sendAIShortcut])
  const showEntryHeader = isWideMode && !!entryId && entryId !== ROUTE_ENTRY_PENDING
  const showTimelineSummaryButton = isWideMode && aiEnabled
  const showAiTimelineToggle = aiEnabled

  const handleAiTimelineButtonClick = useCallback(() => {
    setAiTimelineEnabled((prev) => !prev)
  }, [setAiTimelineEnabled])

  const handleLatestTimelineClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setRecommendedTimelineEnabled(false)
    },
    [setRecommendedTimelineEnabled],
  )

  const handleRecommendedTimelineClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setRecommendedTimelineEnabled(true)
    },
    [setRecommendedTimelineEnabled],
  )

  const renderTimelineModeSwitch = () => {
    if (!LOCAL_RSS_MODE) return null

    return (
      <div
        className="no-drag-region pointer-events-auto flex h-7 shrink-0 items-center whitespace-nowrap rounded-md bg-fill-secondary p-0.5 text-xs font-medium"
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
        role="group"
      >
        <button
          type="button"
          aria-pressed={!recommendedTimelineEnabled}
          className={cn(
            "no-drag-region pointer-events-auto h-6 rounded px-2.5 transition-colors",
            !recommendedTimelineEnabled
              ? "bg-fill text-text shadow-sm"
              : "text-text-secondary hover:text-text",
          )}
          title={t("entry_list_header.latest_timeline")}
          onClick={handleLatestTimelineClick}
        >
          {t("entry_list_header.latest")}
        </button>
        <button
          type="button"
          aria-pressed={recommendedTimelineEnabled}
          className={cn(
            "no-drag-region pointer-events-auto h-6 rounded px-2.5 transition-colors",
            recommendedTimelineEnabled
              ? "bg-fill text-text shadow-sm"
              : "text-text-secondary hover:text-text",
          )}
          title={t("entry_list_header.recommended_timeline")}
          onClick={handleRecommendedTimelineClick}
        >
          {t("entry_list_header.recommended")}
        </button>
      </div>
    )
  }

  const renderAiTimelineButton = () => {
    if (!showAiTimelineToggle) return null
    return (
      <ActionButton
        tooltip={t("entry_list_header.ai_timeline")}
        active={aiTimelineEnabled}
        onClick={handleAiTimelineButtonClick}
      >
        {aiTimelineEnabled ? (
          <i className="i-focal-refresh-4-ai text-purple-600 dark:text-purple-400" />
        ) : (
          <i className="i-focal-refresh-4-ai text-purple-600 dark:text-purple-400" />
        )}
      </ActionButton>
    )
  }

  const renderTimelineSummaryButton = () => {
    if (!showTimelineSummaryButton) return null
    return (
      <ActionButton tooltip={t("entry_list_header.timeline_summary")} onClick={summarizeTimeline}>
        <i className="i-focal-paint-brush-ai text-purple-600 dark:text-purple-400" />
      </ActionButton>
    )
  }

  // Same bottom-edge rule as the All timeline: transparent at rest, border only after scroll.
  const useScrollAwareHeaderBorder = librarySearchActive || view === FeedViewType.All

  return (
    <div
      className={cn(
        "flex w-full flex-col pr-2.5 pt-2 duration-200 @[700px]:pr-3 @[1024px]:pr-4",
        titleStyleBasedView[view],
        !feedColumnShow && "macos:pl-[calc(var(--fo-macos-traffic-light-width,0px)+3.75rem)]",
        isPreview
          ? "h-top-header-in-preview-with-border-b px-2.5 @[700px]:px-3 @[1024px]:px-4"
          : "h-top-header-with-border-b",
        useScrollAwareHeaderBorder &&
          "border-b border-transparent data-[scrolled-beyond-threshold=true]:border-b-border",
      )}
      data-scrolled-beyond-threshold={isScrolledBeyondThresholdValue}
    >
      <div className="flex w-full min-w-0 items-center justify-between gap-2">
        {librarySearchActive ? (
          searchTitleInfo
        ) : isPreview ? (
          <PreviewHeaderInfoWrapper>{titleInfo}</PreviewHeaderInfoWrapper>
        ) : (
          titleInfo
        )}
        {!isPreview && librarySearchActive && (
          <div
            className="relative z-[1] flex shrink-0 translate-x-[6px] items-center gap-2 text-text-secondary"
            onClick={stopPropagation}
            onPointerDown={stopPropagation}
          >
            <button
              type="button"
              className="no-drag-region pointer-events-auto h-8 shrink-0 rounded-md px-2 text-xs text-text-secondary transition-colors hover:bg-fill-secondary hover:text-text"
              onClick={handleClearLibrarySearch}
            >
              {t("search.clear")}
            </button>
          </div>
        )}
        {!isPreview && !librarySearchActive && (
          <div
            className={cn(
              "relative z-[1] flex shrink-0 items-center gap-2 text-text-secondary",
              !headerTitle && "opacity-0 [&_*]:!pointer-events-none",

              "translate-x-[6px]",
            )}
            onClick={stopPropagation}
          >
            {isWideMode &&
              (showEntryHeader || showTimelineSummaryButton || showAiTimelineToggle) && (
                <>
                  {showEntryHeader && <EntryHeader entryId={entryId} />}
                  {(showAiTimelineToggle || showTimelineSummaryButton) && (
                    <div className="flex items-center gap-2">
                      {aiTimelineEnabled && renderAiTimelineButton()}
                      {renderTimelineSummaryButton()}
                    </div>
                  )}
                  <DividerVertical className="mx-2 w-px" />
                </>
              )}

            {!isWideMode && aiTimelineEnabled && renderAiTimelineButton()}

            {renderTimelineModeSwitch()}

            <AppendTaildingDivider>
              {view === FeedViewType.Pictures && <SwitchToMasonryButton />}
            </AppendTaildingDivider>

            <ActionButton
              active={unreadOnly}
              disabled={disableUnreadOnlyToggle}
              tooltip={
                !unreadOnly
                  ? t("entry_list_header.show_unread_only")
                  : t("entry_list_header.show_all")
              }
              shortcut={toggleUnreadOnlyShortcut}
              onClick={() => runCmdFn(COMMAND_ID.timeline.unreadOnly, [!unreadOnly])()}
            >
              <i className="i-focal-list" />
            </ActionButton>
            <MarkAllReadButton shortcut disabled={!hasCurrentTimelineUnread} />
          </div>
        )}
      </div>
    </div>
  )
}

const useCurrentTimelineUnreadCount = () => {
  const routeParams = useRouteParams()
  const { feedId, folderName, inboxId, isAllFeeds, isCollection, listId, smartFeed, view } =
    routeParams

  const allUnread = useUnreadAll()
  const viewUnread = useUnreadByView(view)
  const feedUnread = useUnreadById(feedId ?? "")
  const inboxUnread = useUnreadById(inboxId ?? "")
  const listUnread = useUnreadByListId(listId ?? "")
  const folderFeedIds = useSubscriptionStore(
    useCallback(
      (state) => folderFeedsByFeedIdSelector({ feedIdOrCategory: feedId, view })(state),
      [feedId, view],
    ),
  )
  const folderUnread = useUnreadByIds(folderFeedIds)
  const allCollectionEntryIds = useAllCollectionEntryList()
  const collectionEntryIdsByView = useCollectionEntryList(view)
  const collectionEntryIds =
    view === FeedViewType.All ? allCollectionEntryIds : collectionEntryIdsByView
  const collectionUnread = useEntryStore(
    useCallback(
      (state) => {
        let unread = 0
        for (const entryId of collectionEntryIds) {
          const entry = state.data[entryId]
          if (entry && !entry.read) {
            unread += 1
          }
        }
        return unread
      },
      [collectionEntryIds],
    ),
  )
  const smartFeedDateUnread = useEntryStore(
    useCallback(
      (state) => {
        if (smartFeed !== "today" && smartFeed !== "yesterday") return 0

        const target = new Date()
        if (smartFeed === "yesterday") {
          target.setDate(target.getDate() - 1)
        }

        let unread = 0
        for (const entry of Object.values(state.data)) {
          if (!entry || entry.read) continue
          const { publishedAt } = entry
          if (
            publishedAt.getFullYear() === target.getFullYear() &&
            publishedAt.getMonth() === target.getMonth() &&
            publishedAt.getDate() === target.getDate()
          ) {
            unread += 1
          }
        }
        return unread
      },
      [smartFeed],
    ),
  )

  if (isCollection) return collectionUnread
  if (smartFeed === "unread") return allUnread
  if (smartFeed === "starred") return collectionUnread
  if (smartFeed === "today" || smartFeed === "yesterday") return smartFeedDateUnread
  if (listId) return listUnread
  if (inboxId) return inboxUnread
  if (folderName) return folderUnread
  if (feedId && !isAllFeeds) return feedUnread
  if (isAllFeeds || view === FeedViewType.All) return allUnread
  return viewUnread
}

const PreviewHeaderInfoWrapper: Component = ({ children }) => {
  const { t: tCommon } = useTranslation("common")
  const follow = useFollow()

  const navigate = useNavigate()
  const isLoggedIn = useIsLoggedIn()
  const presentLoginModal = useLoginModal()

  return (
    <div className="flex w-full flex-col pt-1.5">
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
        <MotionButtonBase
          onClick={(e) => {
            e.stopPropagation()
            navigate(previewBackPath() || "/")
          }}
          className="no-drag-region mr-1 inline-flex items-center gap-1 whitespace-nowrap duration-200 hover:text-accent"
        >
          <i className="i-focal-left" />
          <span className="text-sm font-medium">{tCommon("words.back")}</span>
        </MotionButtonBase>
        {children}
        <div />
      </div>

      <button
        type="button"
        className="-mx-4 mt-3.5 flex animate-gradient-x cursor-button place-items-center justify-center gap-1 bg-gradient-to-r from-accent/10 via-accent/15 to-accent/20 px-3 py-2 font-semibold text-accent transition-all duration-300 hover:bg-accent hover:text-white"
        onClick={() => {
          if (!isLoggedIn) {
            presentLoginModal()
            return
          }
          const { feedId, listId } = getRouteParams()
          const feed = getFeedById(feedId)
          follow({
            isList: !!listId,
            id: listId ?? feedId,
            url: feed?.type === "feed" ? feed.url : undefined,
          })
        }}
      >
        <i className="i-focal-add-fill size-4" />
        {tCommon("words.follow")}
      </button>
    </div>
  )
}
