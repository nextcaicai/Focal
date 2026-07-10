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

const SEARCH_DEBOUNCE_MS = 250

/**
 * Primary library search entry (Step 1): sits under the sidebar header.
 * Cmd+K focuses this input; results render in the middle column.
 *
 * Input value is local + debounced into the search session so typing stays
 * smooth (full-library scan must not run on every keystroke).
 */
export const SidebarSearchInput = () => {
  const { t } = useTranslation("app")
  const committedQuery = useLibrarySearchQuery()
  const [draft, setDraft] = useState(committedQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigateEntry = useNavigateEntry()

  // External clears (header clear / sidebar nav) sync draft back.
  useEffect(() => {
    setDraft(committedQuery)
  }, [committedQuery])

  useEffect(() => {
    return EventBus.subscribe(LIBRARY_SEARCH_FOCUS_EVENT, () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

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
      className="mx-2 mb-1 mt-1 shrink-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border border-transparent bg-fill-secondary px-2",
          "focus-within:border-border focus-within:bg-background",
        )}
      >
        <i className="i-lucide-search size-3.5 shrink-0 text-text-tertiary" />
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
          className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary"
          onChange={(e) => {
            const { value } = e.target
            setDraft(value)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
              commitQuery(value)
            }, SEARCH_DEBOUNCE_MS)
          }}
          onKeyDown={(e) => {
            // Keep Focusable / timeline hotkeys from eating letters while typing.
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
        {draft.trim().length > 0 && (
          <button
            type="button"
            className="center size-5 shrink-0 rounded text-text-tertiary hover:text-text"
            aria-label={t("search.clear")}
            onClick={clearAndRestore}
          >
            <i className="i-lucide-x size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
