import { Spring } from "@follow/components/constants/spring.js"
import { RootPortal } from "@follow/components/ui/portal/index.js"
import { ScrollArea } from "@follow/components/ui/scroll-area/index.js"
import { FeedViewType } from "@follow/constants"
import { useTitle } from "@follow/hooks"
import { IN_ELECTRON } from "@follow/shared/constants"
import { useEntry } from "@follow/store/entry/hooks"
import { useFeedById } from "@follow/store/feed/hooks"
import type { FeedModel } from "@follow/store/feed/types"
import { useIsInbox } from "@follow/store/inbox/hooks"
import { useSubscriptionByFeedId } from "@follow/store/subscription/hooks"
import { useEntryTranslation } from "@follow/store/translation/hooks"
import { thenable } from "@follow/utils"
import { stopPropagation } from "@follow/utils/dom"
import { EventBus } from "@follow/utils/event-bus"
import { isYouTubeWatchUrl, transformVideoUrl } from "@follow/utils/url-for-video"
import { cn } from "@follow/utils/utils"
import type { JSAnimation } from "motion/react"
import { useAnimationControls } from "motion/react"
import * as React from "react"
import { memo, useEffect, useRef, useState } from "react"

import { useShowAITranslation } from "~/atoms/ai-translation"
import { useEntryIsInReadability } from "~/atoms/readability"
import { getGeneralSettings, useActionLanguage } from "~/atoms/settings/general"
import { AppErrorBoundary } from "~/components/common/AppErrorBoundary"
import { Focusable } from "~/components/common/Focusable"
import { m } from "~/components/common/Motion"
import { ErrorComponentType } from "~/components/errors/enum"
import { GlassButton } from "~/components/ui/button/GlassButton"
import { HotkeyScope } from "~/constants"
import { useRouteParamsSelector } from "~/hooks/biz/useRouteParams"
import { useFeedSafeUrl } from "~/hooks/common/useFeedSafeUrl"
import { useBlockActions } from "~/modules/ai-chat/store/hooks"
import { BlockSliceAction } from "~/modules/ai-chat/store/slices/block.slice"
import { COMMAND_ID } from "~/modules/command/commands/id"

import { setEntryContentScrollToTop } from "./atoms"
import { ApplyEntryActions } from "./components/ApplyEntryActions"
import { EntryCommandShortcutRegister } from "./components/entry-content/EntryCommandShortcutRegister"
import { EntryContentFallback } from "./components/entry-content/EntryContentFallback"
import { EntryContentLoading } from "./components/entry-content/EntryContentLoading"
import { EntryNoContent } from "./components/entry-content/EntryNoContent"
import { EntryScrollingAndNavigationHandler } from "./components/entry-content/EntryScrollingAndNavigationHandler.js"
import { EntryTitleMetaHandler } from "./components/entry-content/EntryTitleMetaHandler"
import type { EntryContentProps } from "./components/entry-content/types"
import { EntryPrintHeader } from "./components/EntryPrintHeader"
import { getEntryContentLayout } from "./components/layouts"
import type { EntryLayoutProps } from "./components/layouts/types"
import { SourceContentPanel } from "./components/SourceContentView"
import { useEntryContent } from "./hooks"
import { useSelectedTextIntegrationContextMenu } from "./hooks/useSelectedTextIntegrationContextMenu"
import { getSelectedTextFromDocumentSelection } from "./utils/selected-text-context-menu"
import type { TranslationDisplayMode } from "./utils/translation-display"

const contentVariants = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 30 },
}
const getDefaultTranslationDisplayMode = (): TranslationDisplayMode =>
  getGeneralSettings().translationMode

const EntryContentImpl: Component<EntryContentProps> = ({
  entryId,
  noMedia,
  className,
  compact,
}) => {
  const entry = useEntry(entryId, (state) => {
    const { feedId, inboxHandle } = state
    const { title, url } = state

    return { feedId, inboxId: inboxHandle, title, url }
  })

  if (!entry) throw thenable

  useTitle(entry.title)
  const feed = useFeedById(entry.feedId)
  const subscription = useSubscriptionByFeedId(entry.feedId)

  const isInbox = useIsInbox(entry.inboxId)
  const isInReadabilityMode = useEntryIsInReadability(entryId)

  const [translationDisplayMode, setTranslationDisplayMode] = useState<TranslationDisplayMode>(
    getDefaultTranslationDisplayMode,
  )
  const { error, content, isPending } = useEntryContent(entryId, { translationDisplayMode })
  const hasPlayableYouTubeVideo =
    isYouTubeWatchUrl(entry.url) &&
    transformVideoUrl({
      url: entry.url ?? "",
      isIframe: !IN_ELECTRON,
    }) !== null
  const canRenderLayout = !!content || isInReadabilityMode || hasPlayableYouTubeVideo
  const enableTranslation = useShowAITranslation(entryId)
  const actionLanguage = useActionLanguage()
  const entryTranslation = useEntryTranslation({
    entryId,
    language: actionLanguage,
    enabled: enableTranslation,
  })

  const routeView = useRouteParamsSelector((route) => route.view)
  const subscriptionView = subscription?.view
  const view = typeof subscriptionView === "number" ? subscriptionView : routeView
  const [scrollerRef, setScrollerRef] = useState<HTMLDivElement | null>(null)
  const [translationDisplayControlElement, setTranslationDisplayControlElement] =
    useState<HTMLDivElement | null>(null)
  const [isTranslationDisplayControlInView, setIsTranslationDisplayControlInView] = useState(true)
  const safeUrl = useFeedSafeUrl(entryId)

  const [panelPortalElement, setPanelPortalElement] = useState<HTMLDivElement | null>(null)

  const scrollAnimationRef = useRef<JSAnimation<any> | null>(null)

  const isInHasTimelineView = ![
    FeedViewType.Pictures,
    FeedViewType.SocialMedia,
    FeedViewType.Videos,
  ].includes(view)

  const { addOrUpdateBlock, removeBlock } = useBlockActions()
  useEffect(() => {
    addOrUpdateBlock({
      id: BlockSliceAction.SPECIAL_TYPES.mainEntry,
      type: "mainEntry",
      value: entryId,
    })
    return () => {
      removeBlock(BlockSliceAction.SPECIAL_TYPES.mainEntry)
    }
  }, [addOrUpdateBlock, entryId, removeBlock])
  const animationController = useAnimationControls()

  const focusableRef = useRef<HTMLDivElement>(null)
  const showSelectedTextIntegrationContextMenu = useSelectedTextIntegrationContextMenu({ entryId })
  const handleEntryContentContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const handled = showSelectedTextIntegrationContextMenu(
        event,
        getSelectedTextFromDocumentSelection(event.currentTarget),
      )
      if (!handled) {
        stopPropagation(event)
      }
    },
    [showSelectedTextIntegrationContextMenu],
  )

  useEffect(() => {
    animationController.set(contentVariants.exit)
    animationController.start(contentVariants.animate)
    setTranslationDisplayMode(getDefaultTranslationDisplayMode())

    // Scroll to top
    if (scrollerRef) {
      scrollerRef.scrollTop = 0
    }
    focusableRef.current?.focus()
    return () => {
      animationController.stop()
    }
  }, [animationController, entryId, scrollerRef])

  useEffect(() => {
    setEntryContentScrollToTop(true)
  }, [entryId])
  useEffect(() => {
    if (!scrollerRef) return
    let isAtTop = true

    const handler = () => {
      const nextIsAtTop = scrollerRef.scrollTop < 50
      if (nextIsAtTop === isAtTop) return
      isAtTop = nextIsAtTop
      setEntryContentScrollToTop(nextIsAtTop)
    }
    handler()
    scrollerRef.addEventListener("scroll", handler, { passive: true })

    return () => {
      scrollerRef.removeEventListener("scroll", handler)
    }
  }, [scrollerRef])

  useEffect(() => {
    if (!enableTranslation || !scrollerRef || !translationDisplayControlElement) {
      setIsTranslationDisplayControlInView(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsTranslationDisplayControlInView(!!entry?.isIntersecting)
      },
      {
        root: scrollerRef,
        threshold: 0.01,
      },
    )
    observer.observe(translationDisplayControlElement)

    return () => {
      observer.disconnect()
    }
  }, [enableTranslation, entryId, scrollerRef, translationDisplayControlElement])

  const scrollerRefObject = React.useMemo(() => ({ current: scrollerRef }), [scrollerRef])
  const showFloatingTranslationDisplayToggle =
    enableTranslation && !!translationDisplayControlElement && !isTranslationDisplayControlInView
  const layoutTranslation = React.useMemo(
    () =>
      entryTranslation
        ? {
            content: entryTranslation.content ?? undefined,
            title: entryTranslation.title ?? undefined,
          }
        : undefined,
    [entryTranslation],
  )
  return (
    <div className={cn(className, "flex flex-col @container")}>
      <EntryTitleMetaHandler entryId={entryId} />
      <EntryCommandShortcutRegister entryId={entryId} view={view} />

      <div className="w-full" ref={setPanelPortalElement} />

      <Focusable
        ref={focusableRef}
        scope={HotkeyScope.EntryRender}
        className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden @container print:size-auto print:overflow-visible"
      >
        <RootPortal to={panelPortalElement}>
          <EntryScrollingAndNavigationHandler
            scrollAnimationRef={scrollAnimationRef}
            scrollerRef={scrollerRefObject}
          />
        </RootPortal>

        <EntryScrollArea scrollerRef={setScrollerRef}>
          {/* Indicator for the entry */}
          {isInHasTimelineView && (
            <>
              <div className="absolute inset-y-0 left-0 z-[9] flex w-12 items-center justify-center opacity-0 duration-200 hover:opacity-100 group-hover:opacity-40">
                <GlassButton
                  size="sm"
                  className="!-translate-y-12 !bg-material-opaque !opacity-100 hover:!bg-material-opaque"
                  onClick={() => {
                    EventBus.dispatch(COMMAND_ID.timeline.switchToPrevious)
                  }}
                >
                  <i className="i-focal-left-small size-6" />
                </GlassButton>
              </div>

              <div className="absolute inset-y-0 right-0 z-[9] flex w-12 items-center justify-center opacity-0 duration-200 hover:opacity-100 group-hover:opacity-40">
                <GlassButton
                  size="sm"
                  className="!-translate-y-12 !bg-material-opaque !opacity-100 hover:!bg-material-opaque"
                  onClick={() => {
                    EventBus.dispatch(COMMAND_ID.timeline.switchToNext)
                  }}
                >
                  <i className="i-focal-right-small size-6" />
                </GlassButton>
              </div>
            </>
          )}
          <m.div
            lcpOptimization
            className="select-text"
            initial={{ opacity: 0, y: 30 }}
            animate={animationController}
            transition={Spring.presets.smooth}
          >
            <article
              data-testid="entry-render"
              onContextMenu={handleEntryContentContextMenu}
              className={"relative w-full min-w-0 pb-10 pt-12 print:pt-0"}
            >
              <ApplyEntryActions entryId={entryId} key={entryId} />
              <EntryPrintHeader entryId={entryId} />

              {!canRenderLayout ? (
                <div className="center mt-16 min-w-0">
                  {isPending ? (
                    <EntryContentLoading
                      icon={!isInbox ? (feed as FeedModel)?.siteUrl : undefined}
                    />
                  ) : error ? (
                    <div className="center mt-36 flex flex-col items-center gap-3">
                      <i className="i-focal-warning text-4xl text-red" />
                      <span className="text-balance text-center text-sm">Network Error</span>
                      <pre className="mt-6 w-full overflow-auto whitespace-pre-wrap break-all">
                        {error.message}
                      </pre>
                    </div>
                  ) : (
                    <EntryNoContent id={entryId} url={entry.url ?? ""} />
                  )}
                </div>
              ) : (
                <AdaptiveContentRenderer
                  entryId={entryId}
                  view={view}
                  compact={compact}
                  noMedia={noMedia}
                  translation={layoutTranslation}
                  isTranslationEnabled={enableTranslation}
                  translationDisplayMode={translationDisplayMode}
                  onTranslationDisplayModeChange={setTranslationDisplayMode}
                  translationDisplayControlRef={setTranslationDisplayControlElement}
                  showFloatingTranslationDisplayToggle={showFloatingTranslationDisplayToggle}
                />
              )}
            </article>
          </m.div>
        </EntryScrollArea>
        <SourceContentPanel src={safeUrl ?? "#"} />
      </Focusable>
    </div>
  )
}
export const EntryContent: Component<EntryContentProps> = memo((props) => {
  return (
    <AppErrorBoundary errorType={ErrorComponentType.EntryNotFound}>
      <EntryContentFallback entryId={props.entryId}>
        <EntryContentImpl {...props} />
      </EntryContentFallback>
    </AppErrorBoundary>
  )
})

const EntryScrollArea: Component<{
  scrollerRef: React.Ref<HTMLDivElement | null>
  viewportClassName?: string
}> = ({ children, className, scrollerRef, viewportClassName }) => {
  return (
    <ScrollArea.ScrollArea
      focusable
      mask={false}
      flex
      rootClassName={cn(
        "flex-1 min-h-0 relative z-[1] overflow-y-auto print:h-auto print:overflow-visible",
        className,
      )}
      scrollbarClassName="mr-[1.5px] print:hidden"
      ref={scrollerRef}
      viewportClassName={viewportClassName}
      scrollbarProps={{
        className: "mt-16 z-[999]",
      }}
    >
      {children}
    </ScrollArea.ScrollArea>
  )
}

const AdaptiveContentRenderer: React.FC<{
  entryId: string
  view: FeedViewType
  compact?: boolean
  noMedia?: boolean
  translation?: EntryLayoutProps["translation"]
  isTranslationEnabled?: EntryLayoutProps["isTranslationEnabled"]
  translationDisplayMode?: EntryLayoutProps["translationDisplayMode"]
  onTranslationDisplayModeChange?: EntryLayoutProps["onTranslationDisplayModeChange"]
  translationDisplayControlRef?: EntryLayoutProps["translationDisplayControlRef"]
  showFloatingTranslationDisplayToggle?: EntryLayoutProps["showFloatingTranslationDisplayToggle"]
}> = ({
  entryId,
  view,
  compact = false,
  noMedia = false,
  translation,
  isTranslationEnabled,
  translationDisplayMode,
  onTranslationDisplayModeChange,
  translationDisplayControlRef,
  showFloatingTranslationDisplayToggle,
}) => {
  const LayoutComponent = getEntryContentLayout(view)

  return (
    <LayoutComponent
      entryId={entryId}
      compact={compact}
      noMedia={noMedia}
      translation={translation}
      isTranslationEnabled={isTranslationEnabled}
      translationDisplayMode={translationDisplayMode}
      onTranslationDisplayModeChange={onTranslationDisplayModeChange}
      translationDisplayControlRef={translationDisplayControlRef}
      showFloatingTranslationDisplayToggle={showFloatingTranslationDisplayToggle}
    />
  )
}
