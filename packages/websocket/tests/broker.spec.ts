/* eslint-disable unicorn/prefer-event-target */
import { EventEmitter } from 'node:events'

import { describe, expect, it } from 'vitest'

import { RedisPubSubBroker } from '../src/broker'
import type { BrokerMessageHandler } from '../src/types'

class MockRedis extends EventEmitter {
  public readonly subscribed: string[] = []
  public readonly unsubscribed: string[] = []
  public quitCalls = 0

  async subscribe(channel: string): Promise<number> {
    this.subscribed.push(channel)
    return this.subscribed.length
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    this.unsubscribed.push(...channels)
    for (const channel of channels) {
      const index = this.subscribed.indexOf(channel)
      if (index !== -1) {
        this.subscribed.splice(index, 1)
      }
    }
    return this.unsubscribed.length
  }

  async publish(channel: string, message: string): Promise<number> {
    this.emit('message', channel, message)
    return 1
  }

  async quit(): Promise<void> {
    this.quitCalls += 1
  }
}

class ControllableRedis extends EventEmitter {
  public readonly subscribed: string[] = []
  public readonly unsubscribed: string[] = []
  public quitCalls = 0
  private pendingResolvers: Array<() => void> = []

  async subscribe(channel: string): Promise<number> {
    this.subscribed.push(channel)
    return await new Promise<number>((resolve) => {
      this.pendingResolvers.push(() => resolve(this.subscribed.length))
    })
  }

  resolveNextSubscription(): void {
    const resolver = this.pendingResolvers.shift()
    resolver?.()
  }

  async unsubscribe(...channels: string[]): Promise<number> {
    this.unsubscribed.push(...channels)
    for (const channel of channels) {
      const index = this.subscribed.indexOf(channel)
      if (index !== -1) {
        this.subscribed.splice(index, 1)
      }
    }
    return this.unsubscribed.length
  }

  async publish(channel: string, message: string): Promise<number> {
    this.emit('message', channel, message)
    return 1
  }

  async quit(): Promise<void> {
    this.quitCalls += 1
  }
}

describe('RedisPubSubBroker', () => {
  it('dispatches messages to subscribed handlers', async () => {
    const redis = new MockRedis()
    const broker = new RedisPubSubBroker({ publisher: redis as unknown as any, subscriber: redis as unknown as any })

    const payloads: string[] = []
    const handler: BrokerMessageHandler = (message) => {
      payloads.push(message)
    }

    await broker.subscribe('room', handler)
    expect(redis.subscribed).toEqual(['room'])

    await broker.publish('room', 'hello')
    expect(payloads).toEqual(['hello'])

    await broker.unsubscribe('room', handler)
    expect(redis.unsubscribed).toContain('room')
  })

  it('removes channel subscriptions when closing', async () => {
    const redis = new MockRedis()
    const broker = new RedisPubSubBroker({
      publisher: redis as unknown as any,
      subscriber: redis as unknown as any,
      closeClientsOnShutdown: true,
    })

    const handler: BrokerMessageHandler = () => {}
    await broker.subscribe('alpha', handler)
    await broker.subscribe('beta', handler)
    await broker.close()

    expect(redis.unsubscribed).toEqual(expect.arrayContaining(['alpha', 'beta']))
    expect(redis.quitCalls).toBe(2)
  })

  it('continues delivering messages when a handler throws', async () => {
    const redis = new MockRedis()
    const broker = new RedisPubSubBroker({ publisher: redis as unknown as any, subscriber: redis as unknown as any })

    const received: string[] = []
    await broker.subscribe('room', () => {
      throw new Error('boom')
    })
    await broker.subscribe('room', (message) => {
      received.push(message)
    })

    await broker.publish('room', 'payload')
    expect(received).toEqual(['payload'])
  })

  it('waits for pending subscription promises before attaching new handlers', async () => {
    const redis = new ControllableRedis()
    const broker = new RedisPubSubBroker({ publisher: redis as unknown as any, subscriber: redis as unknown as any })

    const events: string[] = []
    const first = broker.subscribe('topic', (message) => {
      events.push(`first:${message}`)
    })
    const second = broker.subscribe('topic', (message) => {
      events.push(`second:${message}`)
    })

    redis.resolveNextSubscription()
    await first
    redis.resolveNextSubscription()
    await second

    await broker.publish('topic', 'hello')
    expect(events).toEqual(['first:hello', 'second:hello'])
  })

  it('keeps subscriptions active until all handlers are removed', async () => {
    const redis = new MockRedis()
    const broker = new RedisPubSubBroker({ publisher: redis as unknown as any, subscriber: redis as unknown as any })

    const handlerA: BrokerMessageHandler = () => {}
    const received: string[] = []
    const handlerB: BrokerMessageHandler = (message) => received.push(message)

    await broker.subscribe('room', handlerA)
    await broker.subscribe('room', handlerB)

    await broker.unsubscribe('room', handlerA)
    expect(redis.unsubscribed).toHaveLength(0)

    await broker.publish('room', 'test')
    expect(received).toEqual(['test'])

    await broker.unsubscribe('room', handlerB)
    expect(redis.unsubscribed).toContain('room')
  })

  it('cleans up subscriptions during close without shutting redis clients', async () => {
    const redis = new MockRedis()
    const broker = new RedisPubSubBroker({ publisher: redis as unknown as any, subscriber: redis as unknown as any })

    await broker.subscribe('room', () => {})
    await broker.close()

    expect(redis.unsubscribed).toContain('room')
    expect(redis.quitCalls).toBe(0)
  })

  it('propagates subscription failures and removes channel references', async () => {
    const redis = new MockRedis()
    const broker = new RedisPubSubBroker({ publisher: redis as unknown as any, subscriber: redis as unknown as any })

    const errorRedis = new MockRedis()
    const failingBroker = new RedisPubSubBroker({
      publisher: errorRedis as unknown as any,
      subscriber: Object.assign(new MockRedis(), {
        async subscribe(channel: string) {
          ;(this as unknown as MockRedis).subscribed.push(channel)
          throw new Error('subscribe-fail')
        },
      }) as unknown as any,
    })

    await expect(failingBroker.subscribe('oops', () => {})).rejects.toThrow('subscribe-fail')
    const failingChannels = Reflect.get(failingBroker, 'channels') as Map<string, unknown>
    expect(failingChannels.size).toBe(0)

    await broker.subscribe('room', () => {})
    const channels = Reflect.get(broker, 'channels') as Map<string, unknown>
    expect(channels.size).toBe(1)
  })

  it('ignores messages published for unknown channels', () => {
    const redis = new MockRedis()
    new RedisPubSubBroker({ publisher: redis as unknown as any, subscriber: redis as unknown as any })
    expect(() => redis.emit('message', 'ghost', 'data')).not.toThrow()
  })

  it('ignores unsubscribe calls for channels without handlers', async () => {
    const redis = new MockRedis()
    const broker = new RedisPubSubBroker({ publisher: redis as unknown as any, subscriber: redis as unknown as any })
    await broker.unsubscribe('ghost', () => {})
    expect(redis.unsubscribed).toHaveLength(0)
  })
})
