export type HydrateStorePerfDetail = {
  count?: number
  dbMs?: number
  sessionMs?: number
  sqliteMs?: number
  immerMs?: number
}

export type HydrateStorePerf = {
  name: string
  ms: number
  detail?: HydrateStorePerfDetail
}

export type HydratePerfReport = {
  totalMs: number
  dbInitMs?: number
  dbMigrateMs?: number
  stores: HydrateStorePerf[]
  postLocalRssMs?: number
}

let lastHydratePerfReport: HydratePerfReport | null = null

const pendingStoreDetails = new Map<string, HydrateStorePerfDetail>()

export const recordHydrateStoreDetail = (name: string, detail: HydrateStorePerfDetail) => {
  pendingStoreDetails.set(name, detail)
}

export const getLastHydratePerfReport = (): HydratePerfReport | null => lastHydratePerfReport

export const setLastHydratePerfReport = (report: HydratePerfReport) => {
  lastHydratePerfReport = report
}

const consumeHydrateStoreDetail = (name: string): HydrateStorePerfDetail | undefined => {
  const detail = pendingStoreDetails.get(name)
  if (detail) pendingStoreDetails.delete(name)
  return detail
}

const formatDetail = (detail: HydrateStorePerfDetail): string => {
  const parts: string[] = []
  if (detail.count != null) parts.push(`count=${detail.count}`)
  if (detail.dbMs != null) parts.push(`db=${detail.dbMs.toFixed(0)}ms`)
  if (detail.sqliteMs != null) parts.push(`sqlite=${detail.sqliteMs.toFixed(0)}ms`)
  if (detail.sessionMs != null) parts.push(`session=${detail.sessionMs.toFixed(0)}ms`)
  if (detail.immerMs != null) parts.push(`immer=${detail.immerMs.toFixed(0)}ms`)
  return parts.length > 0 ? ` (${parts.join(", ")})` : ""
}

/** Multi-line summary for electron-log / DevTools. */
export const formatHydratePerfReport = (report: HydratePerfReport): string => {
  const lines = [`[perf] hydrate total ${report.totalMs.toFixed(0)}ms`]

  if (report.dbInitMs != null) {
    lines.push(`[perf]   db.init ${report.dbInitMs.toFixed(0)}ms`)
  }
  if (report.dbMigrateMs != null) {
    lines.push(`[perf]   db.migrate ${report.dbMigrateMs.toFixed(0)}ms`)
  }

  for (const store of report.stores) {
    lines.push(
      `[perf]   ${store.name} ${store.ms.toFixed(0)}ms${store.detail ? formatDetail(store.detail) : ""}`,
    )
  }

  if (report.postLocalRssMs != null) {
    lines.push(`[perf]   post.localRss ${report.postLocalRssMs.toFixed(0)}ms`)
  }

  return lines.join("\n")
}

export const measureHydrateStore = async (
  name: string,
  hydrate: () => Promise<void>,
): Promise<HydrateStorePerf> => {
  const start = performance.now()
  await hydrate()
  const ms = performance.now() - start
  return {
    name,
    ms,
    detail: consumeHydrateStoreDetail(name),
  }
}
