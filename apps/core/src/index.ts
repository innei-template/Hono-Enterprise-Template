import 'reflect-metadata'

import { serve } from '@hono/node-server'
import { env } from '@hono-template/env'
import { green } from 'picocolors'

import { createConfiguredApp } from './app.factory'
import { logger } from './helpers/logger.helper'
import { WebSocketGatewayProvider } from './modules/websocket/websocket.provider'

process.title = 'Hono HTTP Server'

async function bootstrap() {
  const app = await createConfiguredApp({
    globalPrefix: '/api',
  })

  const hono = app.getInstance()
  const port = env.PORT

  const hostname = env.HOSTNAME
  const server = serve({
    fetch: hono.fetch,
    port,
    hostname,
  })

  // Attach WS gateway to the main HTTP server
  const container = app.getContainer()
  const wsProvider = container.resolve(WebSocketGatewayProvider)
  await wsProvider.attachToHttpServer(server)

  logger.info(
    `Hono HTTP application started on http://${hostname}:${port}. ${green(`+${performance.now().toFixed(2)}ms`)}`,
  )
}

bootstrap().catch((error) => {
  console.error('Application bootstrap failed', error)
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1)
})
