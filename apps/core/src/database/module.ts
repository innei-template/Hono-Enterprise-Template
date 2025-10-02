import { Module } from '@hono-template/framework'
import { injectable } from 'tsyringe'

import { DatabaseConfig } from './config'
import { DbAccessor, DrizzleProvider, PgPoolProvider } from './providers'
import { TransactionInterceptor } from './transaction.interceptor'

@injectable()
class PgPoolTokenProvider {
  constructor(private readonly poolProvider: PgPoolProvider) {}
  get() {
    return this.poolProvider.getPool()
  }
}

@injectable()
class DrizzleTokenProvider {
  constructor(private readonly drizzleProvider: DrizzleProvider) {}
  get() {
    return this.drizzleProvider.getDb()
  }
}

@Module({
  providers: [
    DatabaseConfig,
    PgPoolProvider,
    DrizzleProvider,
    DbAccessor,
    PgPoolTokenProvider,
    DrizzleTokenProvider,
    TransactionInterceptor,
  ],
})
export class DatabaseModule {}
