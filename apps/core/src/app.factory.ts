import 'reflect-metadata'

import type { HonoHttpApplication } from '@hono-template/framework'
import { createApplication, createZodValidationPipe } from '@hono-template/framework'

import { AllExceptionsFilter } from './filters/all-exceptions.filter'
import { LoggingInterceptor } from './interceptors/logging.interceptor'
import { AppModules } from './modules/index.module'

export interface BootstrapOptions {
  globalPrefix?: string
}

const isDevelopment = process.env.NODE_ENV !== 'production'

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
  app.useGlobalPipes(GlobalValidationPipe)

  return app
}
