import { measureHydrateStore } from "./hydrate-perf"
import type { Hydratable } from "./lib/base"
import { behaviorEventActions } from "./modules/behavior-event/store"
import { entryEmbeddingActions } from "./modules/entry-embedding/store"
import { entryQualityScoreActions } from "./modules/entry-quality-score/store"
import { entryRankScoreActions } from "./modules/entry-rank-score/store"
import { entryAiTagsActions } from "./modules/entry-tags/store"
import { imageActions } from "./modules/image/store"
import { interestClusterActions } from "./modules/interest-cluster/store"
import { summaryActions } from "./modules/summary/store"
import { translationActions } from "./modules/translation/store"

const deferredHydrates: Array<{ name: string; actions: Hydratable }> = [
  { name: "entryAiTags", actions: entryAiTagsActions },
  { name: "entryQualityScore", actions: entryQualityScoreActions },
  { name: "entryEmbedding", actions: entryEmbeddingActions },
  { name: "entryRankScore", actions: entryRankScoreActions },
  { name: "behaviorEvent", actions: behaviorEventActions },
  { name: "interestCluster", actions: interestClusterActions },
  { name: "summary", actions: summaryActions },
  { name: "translation", actions: translationActions },
  { name: "image", actions: imageActions },
]

let deferredHydratePromise: Promise<void> | null = null
let deferredHydrateComplete = false

export const isDeferredStoreHydrateComplete = () => deferredHydrateComplete

export const getDeferredStoreHydratePromise = () => deferredHydratePromise

export const startDeferredStoreHydrate = (): Promise<void> => {
  if (deferredHydratePromise) return deferredHydratePromise

  deferredHydratePromise = (async () => {
    const totalStart = performance.now()
    const stores = await Promise.all(
      deferredHydrates.map(({ name, actions }) =>
        measureHydrateStore(name, () => actions.hydrate()),
      ),
    )
    stores.sort((left, right) => right.ms - left.ms)

    const report = {
      totalMs: performance.now() - totalStart,
      stores,
    }
    console.info(
      `[perf] hydrate.deferred total ${report.totalMs.toFixed(0)}ms\n${stores
        .map((store) => `[perf]   ${store.name} ${store.ms.toFixed(0)}ms`)
        .join("\n")}`,
    )
    deferredHydrateComplete = true
  })().catch((error) => {
    deferredHydratePromise = null
    deferredHydrateComplete = false
    throw error
  })

  return deferredHydratePromise
}
