import { Spring } from "@follow/components/constants/spring.js"
import { getViewport } from "@follow/components/hooks/useViewport.js"
import { CircleProgress } from "@follow/components/icons/Progress.js"
import { MotionButtonBase } from "@follow/components/ui/button/index.js"
import { RootPortal } from "@follow/components/ui/portal/index.jsx"
import { useScrollViewElement } from "@follow/components/ui/scroll-area/hooks.js"
import { springScrollTo } from "@follow/utils/scroller"
import { cn } from "@follow/utils/utils"
import { useStore } from "jotai"
import { AnimatePresence } from "motion/react"
import { memo, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { m } from "~/components/common/Motion"
import type { TocRef } from "~/components/ui/markdown/components/Toc"
import { Toc } from "~/components/ui/markdown/components/Toc"
import { useFeature } from "~/hooks/biz/useFeature"
import { openEntryAIChat } from "~/modules/entry-content/utils/open-ai-chat"
import type { TranslationDisplayMode } from "~/modules/entry-content/utils/translation-display"
import { getNextTranslationDisplayMode } from "~/modules/entry-content/utils/translation-display"
import { useWrappedElement, useWrappedElementSize } from "~/providers/wrapped-element-provider"

const getReadPercent = ({
  contentHeight,
  scrollTop,
  viewportHeight,
}: {
  contentHeight: number
  scrollTop: number
  viewportHeight: number
}) => {
  const y = 55
  const deltaHeight = Math.min(scrollTop, viewportHeight)

  return (
    Math.floor(Math.min(Math.max(0, ((scrollTop - y + deltaHeight) / contentHeight) * 100), 100)) ||
    0
  )
}

const useReadPercent = () => {
  const { h } = useWrappedElementSize()

  const scrollElement = useScrollViewElement()
  const store = useStore()
  const [readState, setReadState] = useState({ percent: 0, scrollTop: 0 })
  const readStateRef = useRef(readState)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    readStateRef.current = readState
  }, [readState])

  useEffect(() => {
    if (!scrollElement) return

    const update = () => {
      frameRef.current = null
      const { scrollTop } = scrollElement
      const percent = getReadPercent({
        contentHeight: h,
        scrollTop,
        viewportHeight: getViewport(store).h,
      })
      const { percent: currentPercent, scrollTop: currentScrollTop } = readStateRef.current
      if (currentPercent === percent && Math.abs(currentScrollTop - scrollTop) < 2) {
        return
      }
      setReadState({ percent, scrollTop })
    }

    const handler = () => {
      if (frameRef.current != null) return
      frameRef.current = window.requestAnimationFrame(update)
    }

    update()
    scrollElement.addEventListener("scroll", handler, { passive: true })
    return () => {
      scrollElement.removeEventListener("scroll", handler)
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [h, scrollElement, store])

  return [readState.percent, readState.scrollTop]
}

const getTranslationDisplayToggleLabelKey = (mode: TranslationDisplayMode) =>
  getNextTranslationDisplayMode(mode) === "bilingual"
    ? "entry_content.translation_display.show_bilingual"
    : "entry_content.translation_display.show_translation_only"

const BackTopIndicator: Component<{
  translationDisplayMode?: TranslationDisplayMode
  showTranslationDisplayToggle?: boolean
  onTranslationDisplayModeChange?: (mode: TranslationDisplayMode) => void
}> = memo(
  ({
    className,
    translationDisplayMode,
    showTranslationDisplayToggle = false,
    onTranslationDisplayModeChange,
  }) => {
    const { t } = useTranslation()
    const [readPercent] = useReadPercent()
    const scrollElement = useScrollViewElement()
    const aiEnabled = useFeature("ai")
    const nextTranslationDisplayMode = translationDisplayMode
      ? getNextTranslationDisplayMode(translationDisplayMode)
      : undefined

    return (
      <span
        className={cn(
          "mt-2 flex grow flex-col px-2 font-sans text-sm text-gray-800 dark:text-neutral-300",
          className,
        )}
      >
        <div className="flex items-center gap-2 tabular-nums">
          <CircleProgress percent={readPercent!} size={14} strokeWidth={2} />
          <span>{readPercent}%</span>
          <br />
        </div>
        {showTranslationDisplayToggle && translationDisplayMode && nextTranslationDisplayMode && (
          <MotionButtonBase
            onClick={() => {
              onTranslationDisplayModeChange?.(nextTranslationDisplayMode)
            }}
            className={cn(
              "mt-1 flex flex-nowrap items-center gap-2 text-sm opacity-50 transition-all duration-500 hover:opacity-100",
            )}
          >
            <i className="i-focal-translate-2" />
            <span className="whitespace-nowrap">
              {t(getTranslationDisplayToggleLabelKey(translationDisplayMode))}
            </span>
          </MotionButtonBase>
        )}
        {aiEnabled && (
          <MotionButtonBase
            onClick={() => {
              openEntryAIChat()
            }}
            className={cn(
              "mt-1 flex flex-nowrap items-center gap-2 text-sm opacity-50 transition-all duration-500 hover:opacity-100",
            )}
          >
            <i className="i-focal-ai" />
            <span>{t("entry_content.ask_ai")}</span>
          </MotionButtonBase>
        )}
        <MotionButtonBase
          onClick={() => {
            springScrollTo(0, scrollElement!)
          }}
          className={cn(
            "mt-1 flex flex-nowrap items-center gap-2 opacity-50 transition-all duration-500 hover:opacity-100",
            readPercent! > 10 ? "" : "pointer-events-none opacity-0",
          )}
        >
          <i className="i-focal-arrow-up-circle-fill" />
          <span className="whitespace-nowrap">{t("entry_content.back_top")}</span>
        </MotionButtonBase>
      </span>
    )
  },
)

const useIsScrolling = (debounceMs = 800) => {
  const scrollElement = useScrollViewElement()
  const [isScrolling, setIsScrolling] = useState(false)
  const isScrollingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = () => {
      if (!isScrollingRef.current) {
        isScrollingRef.current = true
        setIsScrolling(true)
      }
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        isScrollingRef.current = false
        setIsScrolling(false)
      }, debounceMs)
    }
    scrollElement?.addEventListener("scroll", handler, { passive: true })
    return () => {
      scrollElement?.removeEventListener("scroll", handler)
      if (timerRef.current) clearTimeout(timerRef.current)
      isScrollingRef.current = false
    }
  }, [scrollElement, debounceMs])

  return isScrolling
}

const SmallScreenReadingFAB = memo(
  ({
    translationDisplayMode,
    showTranslationDisplayToggle = false,
    onTranslationDisplayModeChange,
  }: {
    translationDisplayMode?: TranslationDisplayMode
    showTranslationDisplayToggle?: boolean
    onTranslationDisplayModeChange?: (mode: TranslationDisplayMode) => void
  }) => {
    const { t } = useTranslation()
    const [readPercent] = useReadPercent()
    const scrollElement = useScrollViewElement()
    const aiEnabled = useFeature("ai")
    const isScrolling = useIsScrolling()
    const [containerWidth, setContainerWidth] = useState(0)
    const [expanded, setExpanded] = useState(false)

    // Observe the scroll container width — same element the @[770px] container query resolves against
    useEffect(() => {
      if (!scrollElement) return
      const observer = new ResizeObserver(([entry]) => {
        setContainerWidth(entry?.contentRect?.width ?? 0)
      })
      observer.observe(scrollElement)
      return () => observer.disconnect()
    }, [scrollElement])

    const isSmallScreen = containerWidth > 0 && containerWidth < 770
    const hasScolled = (readPercent as number) > 3
    const nextTranslationDisplayMode = translationDisplayMode
      ? getNextTranslationDisplayMode(translationDisplayMode)
      : undefined

    // collapse action chips when user starts scrolling
    useEffect(() => {
      if (isScrolling) setExpanded(false)
    }, [isScrolling])

    if (!isSmallScreen) return null

    return (
      <RootPortal>
        <div
          className="fixed bottom-20 right-4 z-[999] flex flex-col items-end gap-2"
          data-hide-in-print
        >
          <AnimatePresence>
            {expanded && (
              <m.div
                key="fab-actions"
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={Spring.presets.snappy}
                className="flex flex-col items-end gap-2"
              >
                {showTranslationDisplayToggle &&
                  translationDisplayMode &&
                  nextTranslationDisplayMode && (
                    <MotionButtonBase
                      onClick={() => {
                        onTranslationDisplayModeChange?.(nextTranslationDisplayMode)
                        setExpanded(false)
                      }}
                      className="flex items-center gap-2 rounded-full bg-material-thick px-3.5 py-2 text-sm shadow-sm"
                    >
                      <i className="i-focal-translate-2 shrink-0" />
                      <span className="whitespace-nowrap">
                        {t(getTranslationDisplayToggleLabelKey(translationDisplayMode))}
                      </span>
                    </MotionButtonBase>
                  )}
                {aiEnabled && (
                  <MotionButtonBase
                    onClick={() => {
                      openEntryAIChat()
                      setExpanded(false)
                    }}
                    className="flex items-center gap-2 rounded-full bg-material-thick px-3.5 py-2 text-sm shadow-sm"
                  >
                    <i className="i-focal-ai shrink-0" />
                    <span className="whitespace-nowrap">{t("entry_content.ask_ai")}</span>
                  </MotionButtonBase>
                )}
                {(readPercent as number) > 10 && (
                  <MotionButtonBase
                    onClick={() => {
                      springScrollTo(0, scrollElement!)
                      setExpanded(false)
                    }}
                    className="flex items-center gap-2 rounded-full bg-material-thick px-3.5 py-2 text-sm shadow-sm"
                  >
                    <i className="i-focal-arrow-up-circle-fill shrink-0" />
                    <span className="whitespace-nowrap">{t("entry_content.back_top")}</span>
                  </MotionButtonBase>
                )}
              </m.div>
            )}
          </AnimatePresence>

          <m.div
            animate={
              isScrolling
                ? { opacity: 0, scale: 0.85, y: 4 }
                : hasScolled
                  ? { opacity: 1, scale: 1, y: 0 }
                  : { opacity: 0, scale: 0.85, y: 4 }
            }
            transition={Spring.presets.snappy}
          >
            <MotionButtonBase
              onClick={() => setExpanded((v) => !v)}
              className="flex size-10 items-center justify-center rounded-full bg-material-thick shadow-sm"
            >
              <CircleProgress percent={readPercent as number} size={22} strokeWidth={2.5} />
            </MotionButtonBase>
          </m.div>
        </div>
      </RootPortal>
    )
  },
)

export const ContainerToc = memo(
  ({
    ref,
    className,
    stickyClassName,
    translationDisplayMode,
    showTranslationDisplayToggle = false,
    onTranslationDisplayModeChange,
  }: ComponentType & {
    ref?: React.Ref<TocRef | null>
    className?: string
    stickyClassName?: string
    translationDisplayMode?: TranslationDisplayMode
    showTranslationDisplayToggle?: boolean
    onTranslationDisplayModeChange?: (mode: TranslationDisplayMode) => void
  }) => {
    const wrappedElement = useWrappedElement()

    return (
      <>
        <RootPortal to={wrappedElement!}>
          <div
            className={cn(
              "group absolute right-[-130px] top-0 hidden h-full w-[100px] @[770px]:block",
              className,
            )}
            data-hide-in-print
          >
            <div className={cn("sticky top-0", stickyClassName)}>
              <Toc
                ref={ref}
                className={cn(
                  "flex flex-col items-end animate-in fade-in-0 slide-in-from-bottom-12 easing-spring spring-soft",
                  "max-h-[calc(100vh-100px)] overflow-auto scrollbar-none",
                  "@[700px]:-translate-x-12 @[800px]:-translate-x-4 @[900px]:translate-x-0 @[900px]:items-start",
                )}
              />
              <BackTopIndicator
                translationDisplayMode={translationDisplayMode}
                showTranslationDisplayToggle={showTranslationDisplayToggle}
                onTranslationDisplayModeChange={onTranslationDisplayModeChange}
                className={
                  "@[700px]:-translate-x-4 @[800px]:-translate-x-8 @[900px]:translate-x-0 @[900px]:items-start"
                }
              />
            </div>
          </div>
        </RootPortal>
        <SmallScreenReadingFAB
          translationDisplayMode={translationDisplayMode}
          showTranslationDisplayToggle={showTranslationDisplayToggle}
          onTranslationDisplayModeChange={onTranslationDisplayModeChange}
        />
      </>
    )
  },
)
