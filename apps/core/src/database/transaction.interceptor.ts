import type { CallHandler, ExecutionContext, FrameworkResponse, NestInterceptor } from '@hono-template/framework'
import { createLogger } from '@hono-template/framework'
import type { PoolClient } from 'pg'
import { injectable } from 'tsyringe'

import { getOptionalDbContext, PgPoolProvider, runWithDbContext } from './database.provider'

const logger = createLogger('DB')

@injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(private readonly poolProvider: PgPoolProvider) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    const store = context.getContext()
    const method = store.hono.req.method.toUpperCase()
    const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'

    // Ensure db context exists per request lifecycle
    return await runWithDbContext(async () => {
      if (!isMutating) {
        return await next.handle()
      }

      const client: PoolClient = await this.poolProvider.getPool().connect()
      const store = getOptionalDbContext()!
      store.transaction = { client }
      try {
        await client.query('BEGIN')
        const result = await next.handle()
        await client.query('COMMIT')
        return result
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          logger.error(`Transaction rollback failed: ${String(rollbackError)}`)
        }
        throw error
      } finally {
        store.transaction = undefined
        client.release()
      }
    })
  }
}
