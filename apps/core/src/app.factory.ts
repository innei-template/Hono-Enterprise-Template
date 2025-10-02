import 'reflect-metadata'

import { env } from '@hono-template/env'
import type { HonoHttpApplication } from '@hono-template/framework'
import { createApplication, createZodValidationPipe } from '@hono-template/framework'

import { PgPoolProvider } from './database/providers'
import { TransactionInterceptor } from './database/transaction.interceptor'
import { AllExceptionsFilter } from './filters/all-exceptions.filter'
import { LoggingInterceptor } from './interceptors/logging.interceptor'
import { AppModules } from './modules/index.module'
import { RedisProvider } from './redis/providers'

export interface BootstrapOptions {
  globalPrefix?: string
}

const isDevelopment = env.NODE_ENV !== 'production'

const GlobalValidationPipe = createZodValidationPipe({
  transform: true,
  whitelist: true,
  errorHttpStatusCode: 422,
  forbidUnknownValues: true,
  enableDebugMessages: isDevelopment,
  stopAtFirstError: true,
})

export async function createConfiguredApp(options: BootstrapOptions = {}): Promise<HonoHttpApplication> {
  const app = await createApplication(AppModules, {
    globalPrefix: options.globalPrefix ?? '/api',
  })

  app.useGlobalFilters(AllExceptionsFilter)
  app.useGlobalInterceptors(LoggingInterceptor)
  app.useGlobalInterceptors(TransactionInterceptor)
  app.useGlobalPipes(GlobalValidationPipe)

  // Warm up DB connection during bootstrap
  const container = app.getContainer()
  const poolProvider = container.resolve(PgPoolProvider)
  await poolProvider.warmup()

  // Warm up Redis connection during bootstrap
  const redisProvider = container.resolve(RedisProvider)
  await redisProvider.warmup()

  return app
}
