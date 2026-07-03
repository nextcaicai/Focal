import { beforeEach, describe, expect, it } from "vitest"

import { createIDBKeyValueSnapshot, restoreIDBKeyValueSnapshot } from "./idb-keyval"

const DATABASE_NAME = "FOLLOW_IMAGE_DIMENSIONS_TEST"
const STORE_NAME = "image-dimensions"

const deleteDatabase = async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("IndexedDB deletion blocked"))
  })
}

const putValue = async (key: string, value: unknown) => {
  const request = indexedDB.open(DATABASE_NAME)
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE_NAME)
  }
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  try {
    const transaction = db.transaction([STORE_NAME], "readwrite")
    transaction.objectStore(STORE_NAME).put(value, key)
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

describe("storage migration IndexedDB key-value snapshots", () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  it("exports all key-value entries from a store", async () => {
    await putValue("https://example.com/a.png", { height: 100, width: 200 })
    await putValue("https://example.com/b.png", { height: 300, width: 400 })

    const snapshot = await createIDBKeyValueSnapshot(
      {
        databaseName: DATABASE_NAME,
        storeName: STORE_NAME,
      },
      () => new Date("2026-07-03T00:00:00Z"),
    )

    expect(snapshot).toEqual({
      capturedAt: "2026-07-03T00:00:00.000Z",
      databaseName: DATABASE_NAME,
      entries: [
        { key: "https://example.com/a.png", value: { height: 100, width: 200 } },
        { key: "https://example.com/b.png", value: { height: 300, width: 400 } },
      ],
      storeName: STORE_NAME,
    })
  })

  it("restores entries into the same key-value store", async () => {
    await restoreIDBKeyValueSnapshot({
      capturedAt: "2026-07-03T00:00:00.000Z",
      databaseName: DATABASE_NAME,
      entries: [{ key: "https://example.com/a.png", value: { height: 100, width: 200 } }],
      storeName: STORE_NAME,
    })

    const snapshot = await createIDBKeyValueSnapshot({
      databaseName: DATABASE_NAME,
      storeName: STORE_NAME,
    })

    expect(snapshot.entries).toEqual([
      { key: "https://example.com/a.png", value: { height: 100, width: 200 } },
    ])
  })

  it("can replace stale target entries", async () => {
    await putValue("stale", { value: true })

    await restoreIDBKeyValueSnapshot(
      {
        capturedAt: "2026-07-03T00:00:00.000Z",
        databaseName: DATABASE_NAME,
        entries: [{ key: "fresh", value: { value: true } }],
        storeName: STORE_NAME,
      },
      { mode: "replace" },
    )

    const snapshot = await createIDBKeyValueSnapshot({
      databaseName: DATABASE_NAME,
      storeName: STORE_NAME,
    })

    expect(snapshot.entries).toEqual([{ key: "fresh", value: { value: true } }])
  })
})
