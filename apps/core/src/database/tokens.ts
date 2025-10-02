import type { DBSchema } from '@hono-template/db'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PoolClient } from 'pg'

export type DrizzleDb = NodePgDatabase<DBSchema>

export const DRIZZLE_DB = Symbol.for('core.database.drizzle')
export const PG_POOL = Symbol.for('core.database.pg-pool')

export type DrizzleDbToken = typeof DRIZZLE_DB
export type PgPoolToken = typeof PG_POOL

export interface TransactionContext {
  client: PoolClient
}

export interface DatabaseContextStore {
  transaction?: TransactionContext
  db?: DrizzleDb
}
