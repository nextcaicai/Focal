import { EventBus } from "@follow/utils/event-bus"
import { cn } from "@follow/utils/utils"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  clearLibrarySearch,
  getLibrarySearchSession,
  LIBRARY_SEARCH_FOCUS_EVENT,
  setLibrarySearchQuery,
  useLibrarySearchQuery,
} from "~/atoms/library-search"
import { useNavigateEntry } from "~/hooks/biz/useNavigateEntry"
import { getRouteParams } from "~/hooks/biz/useRouteParams"

import { feedColumnStyles } from "./styles"

const SEARCH_DEBOUNCE_MS = 250

type SidebarSearchInputProps = {
  /** Called when Cmd+K focuses search (e.g. expand parent section). */
  onRequestExpand?: () => void
  /** Peer selection with Today / Unread / Starred — active when search session has a query. */
  isActive?: boolean
  className?: string
}

/**
 * Library search as a peer row to Today / Unread / Starred (UI option D).
 * Mutually exclusive: when active, smart-feed rows are not highlighted.
 */
export const SidebarSearchInput = ({
  onRequestExpand,
  isActive = false,
  className,
}: SidebarSearchInputProps) => {
  const { t } = useTranslation("app")
  const committedQuery = useLibrarySearchQuery()
  const [draft, setDraft] = useState(committedQuery)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigateEntry = useNavigateEntry()

  const hasText = draft.trim().length > 0
  /** Row selected when search results are showing (committed query), not merely focus. */
  const rowActive = isActive || committedQuery.trim().length > 0

  useEffect(() => {
    setDraft(committedQuery)
  }, [committedQuery])

  useEffect(() => {
    return EventBus.subscribe(LIBRARY_SEARCH_FOCUS_EVENT, () => {
      onRequestExpand?.()
      // Expand first, then focus on next frame so input is visible.
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    })
  }, [onRequestExpand])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const clearAndRestore = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    setDraft("")
    const previous = getLibrarySearchSession().previousScope
    clearLibrarySearch()
    if (previous?.feedId) {
      navigateEntry({ feedId: previous.feedId, entryId: null })
    }
  }

  const commitQuery = (value: string) => {
    const { feedId } = getRouteParams()
    setLibrarySearchQuery(value, { previousFeedId: feedId })
  }

  return (
    <div
      data-active={rowActive}
      className={cn(
        // Peer row under "Find" — same geometry as Today / Unread / Starred
        "group/search mt-1 flex h-8 shrink-0 gap-2 px-2.5",
        feedColumnStyles.item,
        focused && !rowActive && "bg-theme-item-hover/50",
        className,
      )}
      onClick={(e) => {
        e.stopPropagation()
        inputRef.current?.focus()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <i
          className={cn(
            "i-lucide-search size-4 shrink-0",
            rowActive ? "text-text-secondary" : "text-text-tertiary",
          )}
        />
        <input
          ref={inputRef}
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={draft}
          placeholder={t("search.library_placeholder")}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-base font-medium !leading-loose text-text outline-none lg:text-sm",
            "placeholder:font-medium placeholder:text-text-tertiary",
          )}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const { value } = e.target
            setDraft(value)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
              commitQuery(value)
            }, SEARCH_DEBOUNCE_MS)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Escape") {
              if (draft.trim() || committedQuery.trim()) {
                e.preventDefault()
                clearAndRestore()
              } else {
                inputRef.current?.blur()
              }
              return
            }
            if (e.key === "Enter") {
              e.preventDefault()
              if (debounceRef.current) {
                clearTimeout(debounceRef.current)
                debounceRef.current = null
              }
              commitQuery(draft)
            }
          }}
        />
      </div>
      {hasText && (
        <button
          type="button"
          className="center ml-2 size-5 shrink-0 rounded text-text-tertiary opacity-70 hover:opacity-100"
          aria-label={t("search.clear")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            clearAndRestore()
          }}
        >
          <i className="i-lucide-x size-3.5" />
        </button>
      )}
    </div>
  )
}
