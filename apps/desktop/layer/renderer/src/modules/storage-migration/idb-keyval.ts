export interface IDBKeyValueEntry {
  key: IDBValidKey
  value: unknown
}

export interface IDBKeyValueSnapshot {
  capturedAt: string
  databaseName: string
  entries: IDBKeyValueEntry[]
  storeName: string
}

type RestoreMode = "merge" | "replace"

interface IDBKeyValueStoreOptions {
  databaseName: string
  indexedDB?: IDBFactory
  storeName: string
}

const getIDBFactory = (factory?: IDBFactory): IDBFactory => {
  if (factory) {
    return factory
  }
  if (typeof indexedDB === "undefined") {
    throw new TypeError("indexedDB is not available")
  }
  return indexedDB
}

const promisifyIDBRequest = <TResult>(request: IDBRequest<TResult>): Promise<TResult> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const waitForTransaction = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

const openKeyValueDatabase = async ({
  databaseName,
  indexedDB: factory,
  storeName,
}: IDBKeyValueStoreOptions) => {
  const request = getIDBFactory(factory).open(databaseName)

  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName)
    }
  }

  return promisifyIDBRequest(request)
}

export const createIDBKeyValueSnapshot = async (
  options: IDBKeyValueStoreOptions,
  now: () => Date = () => new Date(),
): Promise<IDBKeyValueSnapshot> => {
  const idb = await openKeyValueDatabase(options)

  try {
    const transaction = idb.transaction([options.storeName], "readonly")
    const store = transaction.objectStore(options.storeName)
    const entries: IDBKeyValueEntry[] = []

    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve()
          return
        }
        entries.push({
          key: cursor.key,
          value: cursor.value,
        })
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })

    await waitForTransaction(transaction)

    return {
      capturedAt: now().toISOString(),
      databaseName: options.databaseName,
      entries,
      storeName: options.storeName,
    }
  } finally {
    idb.close()
  }
}

export const restoreIDBKeyValueSnapshot = async (
  snapshot: IDBKeyValueSnapshot,
  options?: {
    indexedDB?: IDBFactory
    mode?: RestoreMode
  },
) => {
  const idb = await openKeyValueDatabase({
    databaseName: snapshot.databaseName,
    indexedDB: options?.indexedDB,
    storeName: snapshot.storeName,
  })
  const mode = options?.mode ?? "merge"

  try {
    const transaction = idb.transaction([snapshot.storeName], "readwrite")
    const store = transaction.objectStore(snapshot.storeName)

    if (mode === "replace") {
      store.clear()
    }

    for (const entry of snapshot.entries) {
      store.put(entry.value, entry.key)
    }

    await waitForTransaction(transaction)
  } finally {
    idb.close()
  }
}
