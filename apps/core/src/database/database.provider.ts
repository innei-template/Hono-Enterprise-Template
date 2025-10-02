import { AsyncLocalStorage } from 'node:async_hooks'

import { dbSchema } from '@hono-template/db'
import { createLogger } from '@hono-template/framework'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { injectable } from 'tsyringe'

import { DatabaseConfig } from './database.config'
import type { DatabaseContextStore, DrizzleDb } from './tokens'

const dbContext = new AsyncLocalStorage<DatabaseContextStore>()
const logger = createLogger('DB')

export function runWithDbContext<T>(fn: () => Promise<T> | T) {
  return new Promise<T>((resolve, reject) => {
    dbContext.run({}, () => {
      Promise.resolve(fn()).then(resolve).catch(reject)
    })
  })
}

export function getOptionalDbContext(): DatabaseContextStore | undefined {
  return dbContext.getStore()
}

@injectable()
export class PgPoolProvider {
  private pool?: Pool

  constructor(private readonly config: DatabaseConfig) {}

  getPool(): Pool {
    if (!this.pool) {
      const options = this.config.getOptions()
      this.pool = new Pool({
        connectionString: options.url,
        max: options.max,
        idleTimeoutMillis: options.idleTimeoutMillis,
        connectionTimeoutMillis: options.connectionTimeoutMillis,
      })
      this.pool.on('error', (error) => {
        logger.error(`Unexpected error on idle PostgreSQL client: ${String(error)}`)
      })
    }
    return this.pool
  }

  async warmup(): Promise<void> {
    const pool = this.getPool()
    const client = await pool.connect()
    try {
      await client.query('SELECT 1')
      logger.info('Database connection established successfully')
    } finally {
      client.release()
    }
  }
}

@injectable()
export class DrizzleProvider {
  private db?: DrizzleDb

  constructor(private readonly poolProvider: PgPoolProvider) {}

  getDb(): DrizzleDb {
    if (!this.db) {
      this.db = drizzle(this.poolProvider.getPool(), { schema: dbSchema })
    }
    return this.db
  }
}

@injectable()
export class DbAccessor {
  constructor(
    private readonly provider: DrizzleProvider,
    private readonly poolProvider: PgPoolProvider,
  ) {}

  get(): DrizzleDb {
    const store = getOptionalDbContext()
    if (store?.transaction) {
      if (!store.db) {
        store.db = drizzle(store.transaction.client, { schema: dbSchema })
      }
      return store.db
    }
    return this.provider.getDb()
  }
}
