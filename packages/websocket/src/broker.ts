import type { PrettyLogger } from '@hono-template/framework'
import { createLogger } from '@hono-template/framework'
import type { Redis } from 'ioredis'

import type { BrokerMessageHandler, PubSubBroker } from './types'

export interface RedisPubSubBrokerOptions {
  publisher: Redis
  subscriber: Redis
  loggerNamespace?: string
  closeClientsOnShutdown?: boolean
}

interface ChannelRecord {
  handlers: Set<BrokerMessageHandler>
  subscriptionPromise?: Promise<void>
}

export class RedisPubSubBroker implements PubSubBroker {
  private readonly channels = new Map<string, ChannelRecord>()
  private readonly logger: PrettyLogger
  private readonly subscriber: Redis
  private readonly publisher: Redis
  private readonly closeClientsOnShutdown: boolean

  constructor(private readonly options: RedisPubSubBrokerOptions) {
    this.logger = createLogger(options.loggerNamespace ?? 'WebSocket:RedisBroker')
    this.subscriber = options.subscriber
    this.publisher = options.publisher
    this.closeClientsOnShutdown = options.closeClientsOnShutdown ?? false

    this.subscriber.on('message', (channel: string, message: string) => {
      const record = this.channels.get(channel)
      if (!record) {
        return
      }

      for (const handler of record.handlers) {
        try {
          handler(message)
        } catch (error) {
          this.logger.error('Broker handler threw', error)
        }
      }
    })
  }

  async subscribe(channel: string, handler: BrokerMessageHandler): Promise<void> {
    let record = this.channels.get(channel)

    if (!record) {
      record = { handlers: new Set() }
      this.channels.set(channel, record)
      record.subscriptionPromise = this.subscriber.subscribe(channel).then(() => {
        this.logger.debug('Subscribed to Redis channel %s', channel)
      })
      try {
        await record.subscriptionPromise
      } catch (error) {
        this.channels.delete(channel)
        throw error
      } finally {
        record.subscriptionPromise = undefined
      }
    } else if (record.subscriptionPromise) {
      await record.subscriptionPromise
    }

    record.handlers.add(handler)
  }

  async unsubscribe(channel: string, handler: BrokerMessageHandler): Promise<void> {
    const record = this.channels.get(channel)
    if (!record) {
      return
    }

    record.handlers.delete(handler)

    if (record.handlers.size > 0) {
      return
    }

    this.channels.delete(channel)
    await this.subscriber.unsubscribe(channel)
    this.logger.debug('Unsubscribed from Redis channel %s', channel)
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message)
  }

  async close(): Promise<void> {
    const channels = [...this.channels.keys()]
    if (channels.length > 0) {
      await this.subscriber.unsubscribe(...channels)
      this.channels.clear()
    }

    if (this.closeClientsOnShutdown) {
      await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()])
    }
  }
}
