import { env } from '@hono-template/env'
import { injectable } from 'tsyringe'

export interface DatabaseOptions {
  url: string
  /** Maximum number of clients in the pool */
  max?: number
  /** Number of milliseconds a client must sit idle in the pool and not be checked out before it is disconnected */
  idleTimeoutMillis?: number
  /** Number of milliseconds to wait before timing out when connecting a new client */
  connectionTimeoutMillis?: number
}

@injectable()
export class DatabaseConfig {
  getOptions(): DatabaseOptions {
    const url = env.DATABASE_URL
    if (!url || url.trim().length === 0) {
      throw new Error('DATABASE_URL is required for database connection')
    }

    const max = env.PG_POOL_MAX
    const idleTimeoutMillis = env.PG_IDLE_TIMEOUT
    const connectionTimeoutMillis = env.PG_CONN_TIMEOUT

    return {
      url,
      max,
      idleTimeoutMillis,
      connectionTimeoutMillis,
    }
  }
}
