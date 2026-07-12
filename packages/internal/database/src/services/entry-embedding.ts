import { eq, sql } from "drizzle-orm"

import { db } from "../db"
import { entryEmbeddingsTable } from "../schemas"
import type { EntryEmbeddingSchema } from "../schemas/types"
import type { Resetable } from "./internal/base"

class EntryEmbeddingServiceStatic implements Resetable {
  async reset() {
    await db.delete(entryEmbeddingsTable)
  }

  async upsertEmbedding(data: EntryEmbeddingSchema) {
    await this.upsertEmbeddings([data])
  }

  async upsertEmbeddings(records: EntryEmbeddingSchema[]) {
    if (records.length === 0) return

    const now = new Date().toISOString()

    await db
      .insert(entryEmbeddingsTable)
      .values(
        records.map((record) => ({
          ...record,
          createdAt: record.createdAt ?? now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: entryEmbeddingsTable.entryId,
        set: {
          data: sql`excluded.data`,
          updatedAt: now,
        },
      })
  }

  async getEmbedding(entryId: string) {
    return db.query.entryEmbeddingsTable.findFirst({
      where: eq(entryEmbeddingsTable.entryId, entryId),
    })
  }

  async getAllEmbeddings() {
    return db.query.entryEmbeddingsTable.findMany()
  }

  async deleteEmbedding(entryId: string) {
    await db.delete(entryEmbeddingsTable).where(eq(entryEmbeddingsTable.entryId, entryId))
  }
}

export const entryEmbeddingService = new EntryEmbeddingServiceStatic()

export { type EntryEmbeddingRecord } from "@follow/shared/entry-embedding"
