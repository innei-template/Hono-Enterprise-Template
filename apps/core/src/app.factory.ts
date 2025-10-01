import 'reflect-metadata'

import type { HonoHttpApplication } from '@hono-template/framework'
import { createApplication } from '@hono-template/framework'

import { AppModule } from './modules/app/app.module'
import { AllExceptionsFilter } from './modules/app/filters/all-exceptions.filter'
import { LoggingInterceptor } from './modules/app/interceptors/logging.interceptor'
import { ValidationPipe } from './modules/app/pipes/validation.pipe'

export interface BootstrapOptions {
  globalPrefix?: string
}

export async function createConfiguredApp(
  options: BootstrapOptions = {},
): Promise<HonoHttpApplication> {
  const app = await createApplication(AppModule, {
    globalPrefix: options.globalPrefix ?? '/api',
  })

  app.useGlobalFilters(AllExceptionsFilter)
  app.useGlobalInterceptors(LoggingInterceptor)
  app.useGlobalPipes(ValidationPipe)

  return app
}
