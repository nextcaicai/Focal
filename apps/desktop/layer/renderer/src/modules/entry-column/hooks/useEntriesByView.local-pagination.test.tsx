/* eslint-disable @eslint-react/hooks-extra/ensure-custom-hooks-using-other-hooks, @eslint-react/hooks-extra/no-unnecessary-use-prefix -- mocked hooks keep production export names */
import { FeedViewType } from "@follow/constants"
import { useBehaviorEventStore } from "@follow/store/behavior-event/store"
import * as React from "react"
import { act } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import { SMART_FEED_RECOMMENDED } from "~/lib/timeline-scope"

import { resetRecommendedTimelineSession } from "../recommended-timeline-session"
import { useEntriesByView } from "./useEntriesByView"

type TestEntry = {
  id: string
  feedId: string
  read: boolean
  publishedAt: Date
  insertedAt: Date
  url: string
}

const testState = vi.hoisted(() => ({
  entries: {} as Record<string, TestEntry>,
  sourceIds: [] as string[],
  librarySearchActive: false,
  librarySearchEntryIds: [] as string[],
  routeFeedId: "feed-1",
}))

const sortEntryIdsByRecommendedMock = vi.hoisted(() => vi.fn((entryIds: string[]) => entryIds))
const runLocalRssRefreshMock = vi.hoisted(() => vi.fn(async () => ({ skipped: false })))
const localRssRefreshState = vi.hoisted(() => ({
  isRefreshing: false,
  listener: null as (() => void) | null,
}))

const atoms = vi.hoisted(() => ({
  aiTimeline: Symbol("aiTimeline"),
  myTopics: Symbol("myTopics"),
  selectedStarredGroup: Symbol("selectedStarredGroup"),
  starredGroupAssignments: Symbol("starredGroupAssignments"),
}))

vi.mock("@follow/shared/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@follow/shared/constants")>()
  return {
    ...actual,
    LOCAL_RSS_MODE: true,
  }
})

vi.mock("@follow/store/collection/hooks", () => ({
  useAllCollectionEntryList: () => [],
  useCollectionEntryList: () => [],
}))

vi.mock("@follow/store/collection/store", () => ({
  useCollectionStore: (selector: (state: { collections: Record<string, never> }) => unknown) =>
    selector({ collections: {} }),
}))

vi.mock("@follow/store/entry/hooks", () => ({
  useEntriesQuery: () => ({
    entriesIds: [],
    hasNextPage: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoading: false,
    isReady: false,
  }),
  useEntryIdsByFeedId: () => testState.sourceIds,
  useEntryIdsByFeedIds: () => [],
  useEntryIdsByInboxId: () => [],
  useEntryIdsByListId: () => [],
  useEntryIdsByView: () => testState.sourceIds,
}))

vi.mock("@follow/store/entry/sort", () => ({
  sortEntryIdsByRecommended: (entryIds: string[]) => sortEntryIdsByRecommendedMock(entryIds),
}))

vi.mock("@follow/store/entry/store", () => {
  const useEntryStore = (selector: (state: { data: typeof testState.entries }) => unknown) =>
    selector({ data: testState.entries })
  useEntryStore.getState = () => ({ data: testState.entries })

  return {
    entryActions: {
      getFlattenMapEntries: () => testState.entries,
    },
    entrySyncServices: {
      fetchEntryContentByStream: vi.fn(),
    },
    useEntryStore,
  }
})

vi.mock("@follow/store/entry-embedding/status-store", () => ({
  useEmbeddingJobStatusStore: (
    selector: (state: { snapshot: { isProcessing: boolean } }) => unknown,
  ) => selector({ snapshot: { isProcessing: false } }),
}))

vi.mock("@follow/store/entry-embedding/store", () => {
  const useEntryEmbeddingStore = (
    selector: (state: { data: Record<string, never>; hydrated: boolean }) => unknown,
  ) => selector({ data: {}, hydrated: false })
  useEntryEmbeddingStore.getState = () => ({ data: {}, hydrated: false })
  return { useEntryEmbeddingStore }
})

vi.mock("@follow/store/entry-rank-score/store", () => ({
  useEntryRankScoreStore: (selector: (state: { data: Record<string, never> }) => unknown) =>
    selector({ data: {} }),
}))

vi.mock("@follow/store/entry-quality-score/store", () => ({
  useEntryQualityScoreStore: (selector: (state: { data: Record<string, never> }) => unknown) =>
    selector({ data: {} }),
}))

vi.mock("@follow/store/entry-tags/store", () => ({
  useEntryAiTagsStore: (selector: (state: { data: Record<string, never> }) => unknown) =>
    selector({ data: {} }),
}))

vi.mock("@follow/store/subscription/hooks", () => ({
  useFolderFeedsByFeedId: () => [],
}))

vi.mock("@follow/store/unread/store", () => ({
  unreadSyncService: {
    resetFromRemote: vi.fn(),
  },
}))

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: vi.fn() }),
}))

vi.mock("es-toolkit/compat", () => ({
  debounce: (callback: (...args: unknown[]) => unknown) => callback,
}))

vi.mock("jotai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jotai")>()
  return {
    ...actual,
    useAtomValue: (atom: symbol) => {
      if (atom === atoms.myTopics) return []
      if (atom === atoms.selectedStarredGroup) return null
      if (atom === atoms.starredGroupAssignments) return {}
      return false
    },
  }
})

vi.mock("~/atoms/library-search", () => ({
  useLibrarySearchActive: () => testState.librarySearchActive,
}))

vi.mock("~/atoms/settings/ai", () => ({
  getAISettings: () => ({}),
}))

vi.mock("~/atoms/settings/general", () => ({
  useActionLanguage: () => "en",
  useGeneralSettingKey: () => false,
}))

vi.mock("~/hooks/biz/useFeature", () => ({
  useFeature: () => false,
}))

vi.mock("~/hooks/biz/useQueryEmbeddingVector", () => ({
  useQueryEmbeddingVector: () => null,
}))

vi.mock("~/hooks/biz/useRouteParams", () => ({
  useRouteParams: () => ({
    feedId: testState.routeFeedId,
    inboxId: undefined,
    isCollection: false,
    listId: undefined,
    view: FeedViewType.Articles,
  }),
  useRouteParamsSelector: (
    selector: (params: {
      feedId: string
      inboxId: undefined
      isCollection: false
      listId: undefined
      view: FeedViewType
    }) => unknown,
  ) =>
    selector({
      feedId: testState.routeFeedId,
      inboxId: undefined,
      isCollection: false,
      listId: undefined,
      view: FeedViewType.Articles,
    }),
}))

vi.mock("~/modules/entry-enrichment/trigger", () => ({
  triggerEntryEmbeddingLibraryBackfill: vi.fn(),
  triggerEntryEnrichmentBackfill: vi.fn(),
  triggerEntryRankBackfill: vi.fn(),
}))

vi.mock("~/modules/local-rss/refresh-scheduler", () => ({
  localRssRefreshScheduler: {
    getState: () => ({ isRefreshing: localRssRefreshState.isRefreshing }),
    runRefresh: runLocalRssRefreshMock,
    subscribe: (listener: () => void) => {
      localRssRefreshState.listener = listener
      return () => {
        if (localRssRefreshState.listener === listener) localRssRefreshState.listener = null
      }
    },
  },
}))

vi.mock("~/modules/my-topics/store", () => ({
  myTopicsAtom: atoms.myTopics,
}))

vi.mock("~/modules/starred-groups/store", () => ({
  doesEntryMatchStarredGroupFilter: () => true,
  selectedStarredGroupAtom: atoms.selectedStarredGroup,
  starredGroupAssignmentsAtom: atoms.starredGroupAssignments,
}))

vi.mock("~/store/search/library-search", () => ({
  useLibrarySearchEntryIds: () => testState.librarySearchEntryIds,
}))

vi.mock("../atoms/ai-timeline", () => ({
  aiTimelineEnabledAtom: atoms.aiTimeline,
}))

const createEntry = (index: number): TestEntry => {
  const publishedAt = new Date(Date.UTC(2026, 6, 20, 0, 0, -index))
  return {
    id: `entry-${index}`,
    feedId: "feed-1",
    read: false,
    publishedAt,
    insertedAt: publishedAt,
    url: `https://example.com/${index}`,
  }
}

const replaceEntries = (count: number) => {
  const entries = Array.from({ length: count }, (_, index) => createEntry(index))
  testState.entries = Object.fromEntries(entries.map((entry) => [entry.id, entry]))
  testState.sourceIds = entries.map((entry) => entry.id)
}

describe("useEntriesByView local pagination", () => {
  let root: Root | null = null
  let container: HTMLElement | null = null
  let entriesResult: ReturnType<typeof useEntriesByView> | undefined

  beforeAll(() => {
    ;(globalThis as typeof globalThis & { React: typeof React }).React = React
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    vi.useRealTimers()
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }

    container?.remove()
    root = null
    container = null
    entriesResult = undefined
    testState.librarySearchActive = false
    testState.librarySearchEntryIds = []
    testState.routeFeedId = "feed-1"
    useBehaviorEventStore.setState({ events: [] })
    resetRecommendedTimelineSession()
    localRssRefreshState.isRefreshing = false
    localRssRefreshState.listener = null
    runLocalRssRefreshMock.mockReset()
    runLocalRssRefreshMock.mockResolvedValue({ skipped: false })
    sortEntryIdsByRecommendedMock.mockReset()
    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) => entryIds)
    vi.restoreAllMocks()
  })

  test("keeps loaded pages when a background refresh adds entries outside library search", async () => {
    replaceEntries(65)

    const Consumer = ({ revision }: { revision: number }) => {
      void revision
      entriesResult = useEntriesByView({})
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<Consumer revision={0} />)
    })
    expect(entriesResult?.entriesIds).toHaveLength(30)

    await act(async () => {
      await entriesResult?.fetchNextPage()
    })
    expect(entriesResult?.entriesIds).toHaveLength(60)

    replaceEntries(66)
    testState.librarySearchEntryIds = []
    await act(async () => {
      root?.render(<Consumer revision={1} />)
    })

    expect(entriesResult?.entriesIds).toHaveLength(60)
  })

  test("resets loaded pages when active library search results change", async () => {
    replaceEntries(65)
    testState.librarySearchActive = true
    testState.librarySearchEntryIds = [...testState.sourceIds]

    const Consumer = ({ revision }: { revision: number }) => {
      void revision
      entriesResult = useEntriesByView({})
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<Consumer revision={0} />)
    })

    await act(async () => {
      await entriesResult?.fetchNextPage()
    })
    expect(entriesResult?.entriesIds).toHaveLength(60)

    testState.librarySearchEntryIds = [...testState.sourceIds]
    await act(async () => {
      root?.render(<Consumer revision={1} />)
    })

    expect(entriesResult?.entriesIds).toHaveLength(30)
  })

  test("uses recommended sorting for the dedicated Recommended smart feed", async () => {
    replaceEntries(3)
    testState.routeFeedId = SMART_FEED_RECOMMENDED
    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) =>
      entryIds.slice().reverse().slice(0, 2),
    )

    const Consumer = () => {
      entriesResult = useEntriesByView({})
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<Consumer />)
    })

    expect(sortEntryIdsByRecommendedMock).toHaveBeenCalledWith(["entry-0", "entry-1", "entry-2"])
    expect(entriesResult?.entriesIds).toEqual(["entry-2", "entry-1"])
  })

  test("keeps the Recommended order stable until the user refreshes the timeline", async () => {
    replaceEntries(3)
    testState.routeFeedId = SMART_FEED_RECOMMENDED
    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) => entryIds)

    const Consumer = ({ revision }: { revision: number }) => {
      void revision
      entriesResult = useEntriesByView({})
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<Consumer revision={0} />)
    })
    expect(entriesResult?.entriesIds).toEqual(["entry-0", "entry-1", "entry-2"])

    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) =>
      entryIds.slice().reverse(),
    )
    await act(async () => {
      root?.render(<Consumer revision={1} />)
    })
    expect(entriesResult?.entriesIds).toEqual(["entry-0", "entry-1", "entry-2"])

    await act(async () => {
      await entriesResult?.refetch()
    })
    expect(entriesResult?.entriesIds).toEqual(["entry-2", "entry-1", "entry-0"])
  })

  test("applies Recommended ordering produced while a manual refresh is running", async () => {
    let finishRefresh: FrameRequestCallback | undefined
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      finishRefresh = callback
      return 1
    })
    replaceEntries(3)
    testState.routeFeedId = SMART_FEED_RECOMMENDED
    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) => entryIds)

    const Consumer = ({ revision }: { revision: number }) => {
      void revision
      entriesResult = useEntriesByView({})
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<Consumer revision={0} />)
    })
    expect(entriesResult?.entriesIds).toEqual(["entry-0", "entry-1", "entry-2"])

    runLocalRssRefreshMock.mockImplementation(async () => {
      sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) =>
        entryIds.slice().reverse(),
      )
      root?.render(<Consumer revision={1} />)
      return { skipped: false }
    })

    await act(async () => {
      await entriesResult?.refetch()
    })

    expect(entriesResult?.entriesIds).toEqual(["entry-2", "entry-1", "entry-0"])

    await act(async () => {
      finishRefresh?.(0)
    })
    sortEntryIdsByRecommendedMock.mockImplementation(() => ["entry-1", "entry-0", "entry-2"])
    await act(async () => {
      root?.render(<Consumer revision={2} />)
    })
    expect(entriesResult?.entriesIds).toEqual(["entry-2", "entry-1", "entry-0"])
  })

  test("keeps a newer Recommended refresh active when an earlier refresh finishes", async () => {
    const finishRefreshCallbacks: FrameRequestCallback[] = []
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      finishRefreshCallbacks.push(callback)
      return finishRefreshCallbacks.length
    })
    replaceEntries(3)
    testState.routeFeedId = SMART_FEED_RECOMMENDED

    const Consumer = ({ revision }: { revision: number }) => {
      void revision
      entriesResult = useEntriesByView({})
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<Consumer revision={0} />)
    })

    let resolveFirstRefresh: ((result: { skipped: false }) => void) | undefined
    let resolveSecondRefresh: ((result: { skipped: false }) => void) | undefined
    runLocalRssRefreshMock
      .mockImplementationOnce(
        () =>
          new Promise<{ skipped: false }>((resolve) => {
            resolveFirstRefresh = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<{ skipped: false }>((resolve) => {
            resolveSecondRefresh = resolve
          }),
      )

    let firstRefresh: Promise<unknown> | undefined
    let secondRefresh: Promise<unknown> | undefined
    await act(async () => {
      firstRefresh = entriesResult?.refetch()
      secondRefresh = entriesResult?.refetch()
    })
    await act(async () => {
      resolveFirstRefresh?.({ skipped: false })
      await firstRefresh
    })
    await act(async () => {
      finishRefreshCallbacks[0]?.(0)
    })

    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) =>
      entryIds.slice().reverse(),
    )
    await act(async () => {
      root?.render(<Consumer revision={1} />)
    })
    expect(entriesResult?.entriesIds).toEqual(["entry-2", "entry-1", "entry-0"])

    await act(async () => {
      resolveSecondRefresh?.({ skipped: false })
      await secondRefresh
    })
  })

  test("waits for an in-flight RSS refresh before locking the Recommended order again", async () => {
    const finishRefreshCallbacks: FrameRequestCallback[] = []
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
      finishRefreshCallbacks.push(callback)
      return finishRefreshCallbacks.length
    })
    replaceEntries(3)
    testState.routeFeedId = SMART_FEED_RECOMMENDED
    localRssRefreshState.isRefreshing = true
    runLocalRssRefreshMock.mockResolvedValue({ skipped: true })

    const Consumer = ({ revision }: { revision: number }) => {
      void revision
      entriesResult = useEntriesByView({})
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<Consumer revision={0} />)
    })

    let refresh: Promise<unknown> | undefined
    await act(async () => {
      refresh = entriesResult?.refetch()
    })
    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) =>
      entryIds.slice().reverse(),
    )
    await act(async () => {
      root?.render(<Consumer revision={1} />)
    })
    expect(entriesResult?.entriesIds).toEqual(["entry-2", "entry-1", "entry-0"])

    await act(async () => {
      localRssRefreshState.isRefreshing = false
      localRssRefreshState.listener?.()
      await refresh
    })
    expect(finishRefreshCallbacks).toHaveLength(1)
  })

  test("refreshes the Recommended snapshot after the timeline was unmounted for ten minutes", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-22T00:00:00Z"))
    replaceEntries(3)
    testState.routeFeedId = SMART_FEED_RECOMMENDED
    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) => entryIds)

    const Consumer = () => {
      entriesResult = useEntriesByView({})
      return null
    }

    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<Consumer />)
    })
    expect(entriesResult?.entriesIds).toEqual(["entry-0", "entry-1", "entry-2"])

    await act(async () => {
      root?.unmount()
    })
    root = null

    vi.setSystemTime(new Date("2026-07-22T00:11:00Z"))
    sortEntryIdsByRecommendedMock.mockImplementation((entryIds: string[]) =>
      entryIds.slice().reverse(),
    )
    root = createRoot(container)
    await act(async () => {
      root?.render(<Consumer />)
    })

    expect(entriesResult?.entriesIds).toEqual(["entry-2", "entry-1", "entry-0"])
  })
})
