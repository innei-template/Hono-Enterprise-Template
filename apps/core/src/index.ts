import 'reflect-metadata'

import { serve } from '@hono/node-server'

import { createConfiguredApp } from './app.factory'
import { logger } from './helpers/logger.helper'

process.title = 'Hono HTTP Server'

async function bootstrap() {
  const app = await createConfiguredApp({
    globalPrefix: '/api',
  })

  const hono = app.getInstance()
  const port = Number(process.env.PORT ?? 3000)

  const hostname = process.env.HOSTNAME ?? '0.0.0.0'
  serve({
    fetch: hono.fetch,
    port,
    hostname,
  })

  logger.info(`Hono HTTP application started on http://${hostname}:${port}`)
}

bootstrap().catch((error) => {
  console.error('Application bootstrap failed', error)
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
})
