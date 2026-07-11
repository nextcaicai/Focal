import type { SQL } from "drizzle-orm"
import { sql } from "drizzle-orm"

interface MigrationConfig {
  journal: MigrationJournal
  migrations: Record<string, string>
  migrationsTable?: string
}

interface MigrationJournal {
  version: string
  dialect: string
  entries: {
    idx: number
    version: string
    when: number
    tag: string
    breakpoints: boolean
  }[]
}

interface MigrationMeta {
  sql: string[]
  folderMillis: number
  hash: string
  bps: boolean
}

type MaybePromise<T> = T | Promise<T>
type SQLiteMigrationDatabase = {
  execSync: (query: string) => void
  getAllSync: <TResult>(query: string) => TResult[]
}

interface SQLiteColumnInfo {
  name: string
}

interface SQLiteMigrationRow {
  id: number
  hash: string
  created_at: number | string
}

type SQLiteTableInfoRow = [
  cid: number,
  name: string,
  type: string,
  notNull: number,
  defaultValue: unknown,
  primaryKey: number,
]

const ADD_COLUMN_RE = /^ALTER TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+[`"]?(\w+)[`"]?\s+/i
const DROP_COLUMN_RE = /^ALTER TABLE\s+[`"]?(\w+)[`"]?\s+DROP COLUMN\s+[`"]?(\w+)[`"]?\s*;?$/i

function getAddedColumnsByTable(queries: readonly string[]) {
  const expectedByTable = new Map<string, Set<string>>()

  for (const query of queries) {
    const match = query.trim().match(ADD_COLUMN_RE)
    const tableName = match?.[1]
    const columnName = match?.[2]
    if (!tableName || !columnName) continue

    const columns = expectedByTable.get(tableName) ?? new Set<string>()
    columns.add(columnName)
    expectedByTable.set(tableName, columns)
  }

  return expectedByTable
}

function assertExpectedColumns(
  tableName: string,
  expectedColumns: ReadonlySet<string>,
  actualColumns: ReadonlySet<string>,
) {
  const missingColumns = [...expectedColumns].filter((column) => !actualColumns.has(column))
  if (missingColumns.length > 0) {
    throw new Error(
      `Migration verification failed: ${tableName} is missing columns ${missingColumns.join(", ")}`,
    )
  }
}

async function verifyAddedColumns(
  db: {
    values: <TResult extends unknown[]>(query: SQL) => MaybePromise<TResult[]>
  },
  queries: readonly string[],
) {
  const expectedByTable = getAddedColumnsByTable(queries)

  for (const [tableName, expectedColumns] of expectedByTable) {
    const escapedTableName = tableName.replaceAll("`", "``")
    const rows = await db.values<SQLiteTableInfoRow>(
      sql.raw(`PRAGMA table_info(\`${escapedTableName}\`)`),
    )
    const actualColumns = new Set(rows.map((row) => row[1]))
    assertExpectedColumns(tableName, expectedColumns, actualColumns)
  }
}

// Adapted from Drizzle's SQLite migrator.
async function readMigrationFiles({
  journal,
  migrations,
}: MigrationConfig): Promise<MigrationMeta[]> {
  const migrationQueries: MigrationMeta[] = []

  for await (const journalEntry of journal.entries) {
    const query = migrations[`m${journalEntry.idx.toString().padStart(4, "0")}`]

    if (!query) {
      throw new Error(`Missing migration: ${journalEntry.tag}`)
    }

    try {
      const result = query.split("--> statement-breakpoint").map((it) => {
        return it
      })

      migrationQueries.push({
        sql: result,
        bps: journalEntry.breakpoints,
        folderMillis: journalEntry.when,
        hash: "",
      })
    } catch {
      throw new Error(`Failed to parse migration: ${journalEntry.tag}`)
    }
  }

  return migrationQueries
}

// https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/sqlite-proxy/migrator.ts
export async function migrate<_TSchema extends Record<string, unknown>>(
  db: {
    run: (query: SQL) => MaybePromise<unknown>
    values: <TResult extends unknown[]>(query: SQL) => MaybePromise<TResult[]>
  },
  config: MigrationConfig,
) {
  const migrations = await readMigrationFiles(config)

  const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)
	`

  await db.run(migrationTableCreate)

  const dbMigrations = await db.values<[number, string, string]>(
    sql`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
  )

  const lastDbMigration = dbMigrations[0] ?? undefined

  // Apply pending migrations one statement at a time.
  // Never delete/recreate the database here — callers must not wipe on failure.
  for (const migration of migrations) {
    if (lastDbMigration && Number(lastDbMigration[2])! >= migration.folderMillis) {
      continue
    }

    for (const rawQuery of migration.sql) {
      const query = rawQuery.trim()
      if (!query) continue

      try {
        await db.run(sql.raw(query))
      } catch (error) {
        // Idempotent ADD COLUMN: if a previous partial run already added it, continue.
        // Any other SQL error must surface — do not wipe the database.
        const message = error instanceof Error ? error.message : String(error)
        const isDuplicateColumn =
          /duplicate column name/i.test(message) || /already exists/i.test(message)
        if (isDuplicateColumn && ADD_COLUMN_RE.test(query)) {
          continue
        }
        throw error
      }
    }

    // The desktop SQLite adapter must never turn a failed ALTER into a completed migration.
    // Verify schema postconditions before recording the migration marker.
    await verifyAddedColumns(db, migration.sql)

    await db.run(
      sql.raw(
        `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES('${migration.hash}', '${migration.folderMillis}')`,
      ),
    )
  }
}

function getTableColumns(db: SQLiteMigrationDatabase, tableName: string): Set<string> {
  const escapedTableName = tableName.replaceAll("`", "``")
  const columns = db.getAllSync<SQLiteColumnInfo>(`PRAGMA table_info(\`${escapedTableName}\`)`)
  return new Set(columns.map((column) => column.name))
}

function verifyAddedColumnsSync(db: SQLiteMigrationDatabase, queries: readonly string[]): void {
  const expectedByTable = getAddedColumnsByTable(queries)
  for (const [tableName, expectedColumns] of expectedByTable) {
    assertExpectedColumns(tableName, expectedColumns, getTableColumns(db, tableName))
  }
}

function shouldSkipMigrationQuery(db: SQLiteMigrationDatabase, query: string): boolean {
  const addColumnMatch = query.match(ADD_COLUMN_RE)
  if (addColumnMatch) {
    const tableName = addColumnMatch[1]
    const columnName = addColumnMatch[2]
    if (!tableName || !columnName) {
      return false
    }
    const columns = getTableColumns(db, tableName)
    return columns.has(columnName)
  }

  const dropColumnMatch = query.match(DROP_COLUMN_RE)
  if (dropColumnMatch) {
    const tableName = dropColumnMatch[1]
    const columnName = dropColumnMatch[2]
    if (!tableName || !columnName) {
      return false
    }
    const columns = getTableColumns(db, tableName)
    return !columns.has(columnName)
  }

  return false
}

export async function migrateExpoSQLite(db: SQLiteMigrationDatabase, config: MigrationConfig) {
  const migrations = await readMigrationFiles(config)

  db.execSync(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    );
  `)

  const dbMigrations = db.getAllSync<SQLiteMigrationRow>(
    `SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
  )
  const lastDbMigration = dbMigrations[0] ?? undefined

  for (const migration of migrations) {
    if (lastDbMigration && Number(lastDbMigration.created_at) >= migration.folderMillis) {
      continue
    }

    for (const rawQuery of migration.sql) {
      const query = rawQuery.trim()
      if (!query) {
        continue
      }
      if (shouldSkipMigrationQuery(db, query)) {
        continue
      }
      db.execSync(query)
    }

    verifyAddedColumnsSync(db, migration.sql)

    const escapedHash = migration.hash.replaceAll("'", "''")
    db.execSync(
      `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES('${escapedHash}', '${migration.folderMillis}')`,
    )
  }
}
