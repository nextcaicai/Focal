export interface LocalStorageEntry {
  key: string
  value: string
}

export interface LocalStorageSnapshot {
  capturedAt: string
  entries: LocalStorageEntry[]
}

type RestoreMode = "merge" | "replace"

const getStorage = (storage?: Storage): Storage => {
  if (storage) {
    return storage
  }
  if (typeof localStorage === "undefined") {
    throw new TypeError("localStorage is not available")
  }
  return localStorage
}

export const createLocalStorageSnapshot = (
  storage?: Storage,
  now: () => Date = () => new Date(),
): LocalStorageSnapshot => {
  const target = getStorage(storage)
  const entries: LocalStorageEntry[] = []

  for (let index = 0; index < target.length; index++) {
    const key = target.key(index)
    if (!key) {
      continue
    }
    const value = target.getItem(key)
    if (value === null) {
      continue
    }
    entries.push({ key, value })
  }

  entries.sort((left, right) => left.key.localeCompare(right.key))

  return {
    capturedAt: now().toISOString(),
    entries,
  }
}

export const restoreLocalStorageSnapshot = (
  snapshot: LocalStorageSnapshot,
  options?: {
    mode?: RestoreMode
    storage?: Storage
  },
) => {
  const target = getStorage(options?.storage)
  const mode = options?.mode ?? "merge"

  if (mode === "replace") {
    target.clear()
  }

  for (const entry of snapshot.entries) {
    target.setItem(entry.key, entry.value)
  }
}
