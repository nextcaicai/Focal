import { useEntry } from "@follow/store/entry/hooks"
import { isYouTubeWatchUrl } from "@follow/utils/url-for-video"
import { cn } from "@follow/utils/utils"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { AIChatPanelStyle, useAIChatPanelStyle, useAIPanelVisibility } from "~/atoms/settings/ai"

import { useYouTubeTranscript } from "../../hooks/useYouTubeTranscript"
import { useYouTubeVideoSync } from "../../hooks/useYouTubeVideoSync"
import { AISummary } from "../AISummary"
import { EntryTitle } from "../EntryTitle"
import {
  ContentBody,
  MediaTranscript,
  TranscriptToggle,
  useTranscription,
  YouTubeContentBody,
  YouTubePlaybackControls,
  YouTubeTranscript,
} from "./shared"
import { VideoPlayer } from "./shared/VideoPlayer"
import { parseYouTubeTranscript } from "./shared/youtube-format"
import type { EntryLayoutProps } from "./types"

const PLAYER_HEADER_OFFSET = 52 // h-top-header (3.25rem)
const PLAYER_SAFE_GAP = 12

export const VideosLayout: React.FC<EntryLayoutProps> = ({
  entryId,
  compact = false,
  noMedia = false,
  translation,
}) => {
  const entry = useEntry(entryId, (state) => state)
  const { data: transcriptionData } = useTranscription(entryId)
  const {
    data: youtubeTranscript,
    isLoading: isYouTubeTranscriptLoading,
    isFetched: isYouTubeTranscriptFetched,
    refetch: refetchYouTubeTranscript,
  } = useYouTubeTranscript(entryId, entry?.url)
  const [showTranscript, setShowTranscript] = useState(false)
  const [isPlayerPinned, setIsPlayerPinned] = useState(true)
  const [autoScrollActiveCue, setAutoScrollActiveCue] = useState(true)
  const [highlightActiveCue, setHighlightActiveCue] = useState(true)
  const { t } = useTranslation("app")
  const isYouTubeEntry = isYouTubeWatchUrl(entry?.url)
  const shouldPinPlayer = !isYouTubeEntry || isPlayerPinned

  const aiChatPanelStyle = useAIChatPanelStyle()
  const isAIPanelVisible = useAIPanelVisibility()
  const shouldShowAISummary = aiChatPanelStyle === AIChatPanelStyle.Floating || !isAIPanelVisible

  const playerRef = useRef<HTMLElement>(null)
  const youtubeCues = useMemo(
    () => (youtubeTranscript ? parseYouTubeTranscript(youtubeTranscript) : []),
    [youtubeTranscript],
  )
  const { activeCueId, seekTo } = useYouTubeVideoSync({
    playerRef,
    cues: youtubeCues,
    enabled:
      showTranscript &&
      !transcriptionData &&
      !!youtubeTranscript &&
      (autoScrollActiveCue || highlightActiveCue),
  })

  // Measure the pinned player height so auto-scrolled cues land below it
  // instead of being hidden behind the sticky player + floating header.
  const stickyObserverRef = useRef<ResizeObserver | null>(null)
  const [cueScrollMarginTop, setCueScrollMarginTop] = useState(0)
  const stickyPlayerRef = useCallback((node: HTMLDivElement | null) => {
    stickyObserverRef.current?.disconnect()
    if (!node) return
    const update = () =>
      setCueScrollMarginTop(PLAYER_HEADER_OFFSET + node.offsetHeight + PLAYER_SAFE_GAP)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    stickyObserverRef.current = observer
  }, [])

  useEffect(() => {
    if (shouldPinPlayer) return
    setCueScrollMarginTop(PLAYER_HEADER_OFFSET + PLAYER_SAFE_GAP)
  }, [shouldPinPlayer])

  if (!entry) return null

  const showYouTubePlaybackControls = isYouTubeEntry && !noMedia
  const hasTranscript = !!transcriptionData || !!youtubeTranscript
  const showNoTranscriptMessage =
    isYouTubeEntry && isYouTubeTranscriptFetched && !isYouTubeTranscriptLoading && !hasTranscript
  const content = translation?.content || entry.content || entry.description

  return (
    <div className="mx-auto flex h-full flex-col p-6">
      {/* Offset the sticky top by the floating header height (h-top-header: 3.25rem)
          so the pinned player is never tucked under the absolute AIEntryHeader. */}
      <div
        ref={shouldPinPlayer ? stickyPlayerRef : undefined}
        className={cn(
          "z-10 mb-4 w-full bg-background pb-2 pt-2",
          shouldPinPlayer && "sticky top-[3.25rem]",
        )}
      >
        {!noMedia ? (
          <VideoPlayer
            entryId={entryId}
            showDuration={true}
            preferFullSize={true}
            translation={translation}
            className="w-full"
            playerElementRef={playerRef}
          />
        ) : (
          <div className="center aspect-video w-full flex-col gap-1 rounded-md bg-material-medium text-sm text-text-secondary">
            <i className="i-focal-video-fill mb-2 size-12" />
            Video content not available
          </div>
        )}
        {showYouTubePlaybackControls && (
          <YouTubePlaybackControls
            isPlayerPinned={isPlayerPinned}
            autoScrollActiveCue={autoScrollActiveCue}
            highlightActiveCue={highlightActiveCue}
            labels={{
              pinPlayer: t("entry_content.youtube_controls.pin_player"),
              autoScroll: t("entry_content.youtube_controls.auto_scroll"),
              highlightCurrentLine: t("entry_content.youtube_controls.highlight_current_line"),
            }}
            onPlayerPinnedChange={setIsPlayerPinned}
            onAutoScrollActiveCueChange={setAutoScrollActiveCue}
            onHighlightActiveCueChange={setHighlightActiveCue}
          />
        )}
      </div>

      <div className="flex-1 space-y-4">
        <EntryTitle entryId={entryId} compact={compact} />

        <TranscriptToggle
          showTranscript={showTranscript}
          onToggle={(next) => {
            setShowTranscript(next)
            if (next && isYouTubeEntry && !youtubeTranscript && !transcriptionData) {
              refetchYouTubeTranscript()
            }
          }}
          hasTranscript={hasTranscript || isYouTubeEntry}
        />

        {showTranscript ? (
          transcriptionData ? (
            <MediaTranscript
              className="prose !max-w-full dark:prose-invert"
              srt={transcriptionData}
              entryId={entryId}
              type="subtitle"
            />
          ) : youtubeTranscript ? (
            <YouTubeTranscript
              content={youtubeTranscript}
              activeCueId={activeCueId}
              autoScrollActiveCue={autoScrollActiveCue}
              highlightActiveCue={highlightActiveCue}
              onCueSeek={seekTo}
              cueScrollMarginTop={cueScrollMarginTop}
            />
          ) : isYouTubeTranscriptLoading ? (
            <div className="text-sm text-text-secondary">
              {t("entry_content.transcript_loading")}
            </div>
          ) : showNoTranscriptMessage ? (
            <div className="text-sm text-text-secondary">{t("entry_content.no_transcript")}</div>
          ) : null
        ) : (
          <>
            {shouldShowAISummary && <AISummary entryId={entryId} />}
            {isYouTubeEntry && content ? (
              <YouTubeContentBody content={content} className={compact ? "text-sm" : undefined} />
            ) : (
              <ContentBody
                entryId={entryId}
                translation={translation}
                compact={compact}
                noMedia={true}
                className="text-base"
              />
            )}
            {showNoTranscriptMessage && (
              <div className="text-sm text-text-tertiary">{t("entry_content.no_transcript")}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
