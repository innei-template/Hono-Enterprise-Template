import { Server } from 'node:http'

import type { ServerType } from '@hono/node-server'
import type { OnModuleDestroy, OnModuleInit } from '@hono-template/framework'
import { createLogger } from '@hono-template/framework'
import type { RedisClient as Redis } from '@hono-template/redis'
import { RedisPubSubBroker, RedisWebSocketGateway } from '@hono-template/websocket'
import { injectable } from 'tsyringe'

import { RedisProvider } from '../../redis/redis.provider'
import { WebSocketConfig } from './websocket.config'

@injectable()
export class WebSocketGatewayProvider implements OnModuleInit, OnModuleDestroy {
  private gateway?: RedisWebSocketGateway
  private broker?: RedisPubSubBroker
  private subscriber?: Redis

  constructor(
    private readonly config: WebSocketConfig,
    private readonly redisProvider: RedisProvider,
  ) {}

  private isHttpAttached = false

  private readonly logger = createLogger('WebSocket')

  async onModuleInit(): Promise<void> {
    const publisher = this.redisProvider.getClient()
    const subscriber = publisher.duplicate()
    this.attachTelemetry(subscriber)
    this.subscriber = subscriber

    const broker = new RedisPubSubBroker({ publisher, subscriber })
    this.broker = broker
  }

  async attachToHttpServer(server: ServerType): Promise<void> {
    if (this.gateway) {
      this.logger.warn('WebSocket gateway already attached to HTTP server; skipping')
      return
    }
    if (!this.broker) {
      this.logger.error('WebSocket broker is not initialized yet')
      return
    }
    if (!(server instanceof Server)) {
      this.logger.warn('WebSocket gateway server is not an HTTP server; skipping')
      return
    }

    this.logger.info('Attaching WebSocket gateway to HTTP server')

    const gateway = new RedisWebSocketGateway({
      broker: this.broker,
      server,
      path: this.config.getPath(),
      heartbeatIntervalMs: this.config.getHeartbeatInterval(),
    })
    await gateway.start()
    this.isHttpAttached = true
    this.gateway = gateway

    const { address } = gateway
    this.logger.info('WebSocket gateway started (attached to HTTP server)', {
      path: this.config.getPath(),
      port: address?.port ?? 'unknown',
    })
  }

  getIsHttpAttached(): boolean {
    return this.isHttpAttached
  }

  async onModuleDestroy(): Promise<void> {
    if (this.gateway) {
      await this.gateway.stop()
      this.gateway = undefined
    }

    if (this.subscriber) {
      await this.subscriber.quit()
      this.subscriber = undefined
    }

    this.broker = undefined
  }

  getGateway(): RedisWebSocketGateway | undefined {
    return this.gateway
  }

  private attachTelemetry(client: Redis): void {
    client.on('error', (error) => {
      this.logger.error('Redis subscriber errored', error)
    })
    client.on('connect', () => {
      this.logger.info('Redis subscriber connecting')
    })
    client.on('ready', () => {
      this.logger.info('Redis subscriber ready')
    })
    client.on('end', () => {
      this.logger.warn('Redis subscriber connection closed')
    })
  }
}
