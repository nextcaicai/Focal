import { useEntryStore } from "@follow/store/entry/store"
import { useEntryEmbeddingStore } from "@follow/store/entry-embedding/store"
import type { Storyline } from "@follow/store/storyline/engine"
import { STORYLINE_WINDOW_HOURS } from "@follow/store/storyline/engine"
import { storylineActions, useStorylineStore } from "@follow/store/storyline/store"
import { cn } from "@follow/utils"
import type { ReactNode } from "react"
import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useShallow } from "zustand/shallow"

import { useAISettingKey } from "~/atoms/settings/ai"
import { useNavigateEntry } from "~/hooks/biz/useNavigateEntry"
import { isLocalEmbeddingConfigured } from "~/modules/ai/local-embedding"
import { useSettingModal } from "~/modules/settings/modal/use-setting-modal-hack"

import { refreshStorylines } from "./analysis"

const formatDateTime = (value: number, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))

const formatDate = (value: number, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value))

const useStorylineRefresh = () => {
  const embeddingHydrated = useEntryEmbeddingStore((state) => state.hydrated)
  const embeddingData = useEntryEmbeddingStore((state) => state.data)
  const entryAnalysisInput = useEntryStore(
    useShallow((state) =>
      Object.values(state.data).flatMap((entry) => [
        entry.id,
        entry.feedId,
        entry.title,
        entry.description,
        entry.publishedAt.getTime(),
      ]),
    ),
  )

  useEffect(() => {
    if (!embeddingHydrated) return
    const timer = setTimeout(() => {
      void refreshStorylines().catch(() => {})
    }, 120)
    return () => clearTimeout(timer)
  }, [embeddingData, embeddingHydrated, entryAnalysisInput])
}

export const StorylineLayout = () => {
  useStorylineRefresh()

  return (
    <div className="flex h-full min-w-0 flex-1 bg-theme-background">
      <StorylineColumn />
      <StorylineDetail />
    </div>
  )
}

const StorylineColumn = () => {
  const { t, i18n } = useTranslation()
  const showSettings = useSettingModal()
  const embeddingSettings = useAISettingKey("embedding")
  const embeddingConfigured = isLocalEmbeddingConfigured(embeddingSettings)
  const status = useStorylineStore((state) => state.status)
  const storylines = useStorylineStore((state) => state.storylines)
  const selectedStorylineId = useStorylineStore((state) => state.selectedStorylineId)
  const embeddingRecordCount = useStorylineStore((state) => state.embeddingRecordCount)
  const recentEntryCount = useStorylineStore((state) => state.recentEntryCount)
  const embeddedRecentEntryCount = useStorylineStore((state) => state.embeddedRecentEntryCount)
  const analyzedRecentEntryCount = useStorylineStore((state) => state.analyzedRecentEntryCount)
  const lastBuiltAt = useStorylineStore((state) => state.lastBuiltAt)
  const errorMessage = useStorylineStore((state) => state.errorMessage)

  const refresh = () => {
    void refreshStorylines().catch(() => {})
  }

  return (
    <section className="flex h-full w-[360px] min-w-[300px] max-w-[440px] shrink-0 flex-col border-r border-fill-tertiary bg-theme-background">
      <header className="flex min-h-16 items-center justify-between border-b border-fill-tertiary px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-text">{t("storyline.title")}</h1>
          <p className="mt-0.5 text-xs text-text-secondary">
            {t("storyline.window_hint", { hours: STORYLINE_WINDOW_HOURS })}
          </p>
        </div>
        <button
          type="button"
          className="center size-8 shrink-0 rounded-lg text-text-secondary transition-colors hover:bg-fill-secondary hover:text-text"
          aria-label={t("storyline.refresh")}
          disabled={status === "processing"}
          onClick={refresh}
        >
          <i
            className={cn(
              "i-focal-refresh-2 size-4",
              status === "processing" && "animate-spin text-text-quaternary",
            )}
          />
        </button>
      </header>

      {lastBuiltAt && (
        <div className="flex items-center justify-between border-b border-fill-tertiary px-4 py-2 text-xs text-text-tertiary">
          <span>
            {t("storyline.embedding_coverage", {
              embedded: embeddedRecentEntryCount,
              total: recentEntryCount,
            })}
            {analyzedRecentEntryCount < embeddedRecentEntryCount && (
              <>
                <span aria-hidden> · </span>
                {t("storyline.analysis_limit", { count: analyzedRecentEntryCount })}
              </>
            )}
          </span>
          <span>{formatDateTime(lastBuiltAt, i18n.language)}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === "idle" || (status === "processing" && storylines.length === 0) ? (
          <StorylineState
            icon="i-focal-loading-3"
            iconClassName="animate-spin"
            title={t("storyline.processing.title")}
            description={t("storyline.processing.description")}
          />
        ) : status === "error" ? (
          <StorylineState
            icon="i-focal-alert-fill"
            title={t("storyline.error.title")}
            description={errorMessage || t("storyline.error.description")}
            actionLabel={t("storyline.refresh")}
            onAction={refresh}
          />
        ) : !embeddingConfigured ? (
          <StorylineState
            icon="i-focal-settings-3"
            title={t("storyline.setup.title")}
            description={t("storyline.setup.description")}
            actionLabel={t("storyline.open_ai_settings")}
            onAction={() => showSettings("ai")}
          />
        ) : embeddingRecordCount === 0 || embeddedRecentEntryCount === 0 ? (
          <StorylineState
            icon="i-focal-route"
            title={t("storyline.indexing_empty.title")}
            description={t("storyline.indexing_empty.description")}
          />
        ) : storylines.length === 0 ? (
          <StorylineState
            icon="i-focal-link"
            title={t("storyline.empty.title")}
            description={t("storyline.empty.description", { hours: STORYLINE_WINDOW_HOURS })}
          />
        ) : (
          <div>
            {storylines.map((storyline) => (
              <StorylineListItem
                key={storyline.id}
                storyline={storyline}
                selected={storyline.id === selectedStorylineId}
                locale={i18n.language}
                onSelect={() => storylineActions.select(storyline.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

const StorylineListItem = ({
  storyline,
  selected,
  locale,
  onSelect,
}: {
  storyline: Storyline
  selected: boolean
  locale: string
  onSelect: () => void
}) => {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className={cn(
        "relative w-full border-b border-fill-tertiary px-4 py-4 text-left transition-colors",
        selected ? "bg-selection-focused-fill" : "hover:bg-fill-quinary",
      )}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {selected && <span className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-blue" />}
      <strong className="line-clamp-2 font-semibold text-text">{storyline.title}</strong>
      <p className="mt-1.5 line-clamp-2 text-sm text-text-secondary">{storyline.summary}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-text-tertiary">
        <span>
          {t("storyline.reports_sources", {
            reports: storyline.currentEntryIds.length,
            sources: storyline.distinctSourceCount,
          })}
        </span>
        {storyline.history.length > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>{t("storyline.history_count", { count: storyline.history.length })}</span>
          </>
        )}
        <time className="ml-auto shrink-0">
          {formatDateTime(storyline.latestPublishedAt, locale)}
        </time>
      </div>
    </button>
  )
}

const StorylineDetail = () => {
  const selectedStorylineId = useStorylineStore((state) => state.selectedStorylineId)
  const storylines = useStorylineStore((state) => state.storylines)
  const storyline = useMemo(
    () => storylines.find((item) => item.id === selectedStorylineId) ?? null,
    [selectedStorylineId, storylines],
  )

  if (!storyline) {
    return (
      <div className="center h-full min-w-0 flex-1 px-8">
        <StorylineState icon="i-focal-link" title="" description="" compact />
      </div>
    )
  }

  return <StorylineDetailContent storyline={storyline} />
}

const StorylineDetailContent = ({ storyline }: { storyline: Storyline }) => {
  const { t, i18n } = useTranslation()
  const navigateEntry = useNavigateEntry()
  const entries = useEntryStore((state) => state.data)
  const currentEntries = storyline.currentEntryIds
    .map((entryId) => entries[entryId])
    .filter((entry) => !!entry)
  const historyEntries = storyline.history
    .map((match) => entries[match.entryId])
    .filter((entry) => !!entry)
  const allEntries = [...currentEntries, ...historyEntries]

  const openEntry = (entryId: string, feedId?: string | null) => {
    navigateEntry({
      entryId,
      feedId: feedId ?? null,
      backPath: "/storylines",
    })
  }

  return (
    <article className="min-w-0 flex-1 overflow-y-auto bg-theme-background">
      <div className="mx-auto w-full max-w-4xl px-7 pb-16 pt-8">
        <header className="border-b border-fill-tertiary pb-7">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
            <span>{t("storyline.latest_update")}</span>
            <span aria-hidden>·</span>
            <time>{formatDateTime(storyline.latestPublishedAt, i18n.language)}</time>
            <span className="ml-auto">
              {t("storyline.reports_sources", {
                reports: storyline.currentEntryIds.length,
                sources: storyline.distinctSourceCount,
              })}
            </span>
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-text">
            {storyline.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-text-secondary">
            {storyline.summary}
          </p>
        </header>

        <StorylineSection icon="i-focal-history" title={t("storyline.latest_progress")}>
          <div className="space-y-1">
            {currentEntries.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                className="group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-fill-quinary"
                onClick={() => openEntry(entry.id, entry.feedId)}
              >
                <span className="center mt-0.5 size-6 shrink-0 rounded-full bg-fill-secondary text-xs text-text-secondary">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="line-clamp-2 font-medium text-text">{entry.title}</strong>
                  <span className="mt-1 block text-xs text-text-tertiary">
                    {formatDateTime(entry.publishedAt.getTime(), i18n.language)}
                  </span>
                </span>
                <i className="i-focal-external-link mt-1 size-4 shrink-0 text-text-quaternary group-hover:text-text-secondary" />
              </button>
            ))}
          </div>
        </StorylineSection>

        <StorylineSection icon="i-focal-link" title={t("storyline.history")}>
          {historyEntries.length === 0 ? (
            <p className="rounded-xl bg-fill-quinary px-4 py-5 text-sm text-text-secondary">
              {t("storyline.no_history")}
            </p>
          ) : (
            <ol className="relative space-y-5 border-l border-fill-secondary pl-5">
              {historyEntries.map((entry) => (
                <li key={entry.id} className="relative">
                  <span className="absolute -left-[1.47rem] top-1.5 size-2 rounded-full bg-blue ring-4 ring-background" />
                  <time className="text-xs text-text-tertiary">
                    {formatDate(entry.publishedAt.getTime(), i18n.language)}
                  </time>
                  <button
                    type="button"
                    className="group mt-1 flex w-full items-start gap-3 text-left"
                    onClick={() => openEntry(entry.id, entry.feedId)}
                  >
                    <strong className="line-clamp-2 min-w-0 flex-1 font-medium text-text group-hover:underline">
                      {entry.title}
                    </strong>
                    <i className="i-focal-external-link mt-1 size-4 shrink-0 text-text-quaternary" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </StorylineSection>

        <StorylineSection icon="i-focal-documents" title={t("storyline.source_articles")}>
          <div className="divide-y divide-fill-tertiary rounded-xl bg-fill-quinary px-4">
            {allEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="group flex w-full items-center gap-3 py-3 text-left"
                onClick={() => openEntry(entry.id, entry.feedId)}
              >
                <span className="min-w-0 flex-1">
                  <strong className="line-clamp-1 font-medium text-text">{entry.title}</strong>
                  <span className="mt-0.5 block text-xs text-text-tertiary">
                    {formatDateTime(entry.publishedAt.getTime(), i18n.language)}
                  </span>
                </span>
                <i className="i-focal-external-link size-4 shrink-0 text-text-quaternary group-hover:text-text-secondary" />
              </button>
            ))}
          </div>
        </StorylineSection>

        <p className="mt-8 text-center text-xs text-text-quaternary">
          {t("storyline.experimental_notice")}
        </p>
      </div>
    </article>
  )
}

const StorylineSection = ({
  icon,
  title,
  children,
}: {
  icon: string
  title: string
  children: ReactNode
}) => (
  <section className="border-b border-fill-tertiary py-7 last:border-b-0">
    <div className="mb-4 flex items-center gap-2">
      <i className={cn(icon, "size-4 text-orange")} />
      <h2 className="text-lg font-semibold text-text">{title}</h2>
    </div>
    {children}
  </section>
)

const StorylineState = ({
  icon,
  iconClassName,
  title,
  description,
  actionLabel,
  onAction,
  compact,
}: {
  icon: string
  iconClassName?: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
}) => (
  <div className={cn("center flex-col px-8 text-center", compact ? "py-10" : "min-h-72 py-16")}>
    <div className="center mb-4 size-11 rounded-2xl bg-fill-secondary text-text-secondary">
      <i className={cn(icon, "size-5", iconClassName)} />
    </div>
    {title && <h2 className="font-semibold text-text">{title}</h2>}
    {description && (
      <p className="mt-2 max-w-xs text-sm leading-6 text-text-secondary">{description}</p>
    )}
    {actionLabel && onAction && (
      <button
        type="button"
        className="mt-4 rounded-lg bg-control-enabled px-3 py-1.5 text-sm font-medium text-text transition-opacity hover:opacity-80"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    )}
  </div>
)
