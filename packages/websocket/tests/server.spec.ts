/* eslint-disable unicorn/prefer-event-target */
import { EventEmitter } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'

import { RedisWebSocketGateway } from '../src/server'
import type { BrokerMessageHandler, ClientConnection, PubSubBroker, ServerMessage } from '../src/types'

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events')

  class FakeWebSocket extends EventEmitter {
    static OPEN = 1
    static CLOSED = 3

    readyState = FakeWebSocket.OPEN
    sent: unknown[] = []
    pingCount = 0
    autoPong = true
    lastClose?: { code?: number; reason?: string }

    send(data: unknown): void {
      const payload = typeof data === 'string' ? data : data instanceof Buffer ? data.toString() : String(data)
      this.sent.push(JSON.parse(payload))
      this.emit('sent')
    }

    ping(): void {
      this.pingCount += 1
      if (this.autoPong) {
        this.emit('pong')
      }
    }

    terminate(): void {
      if (this.readyState === FakeWebSocket.CLOSED) {
        return
      }
      this.readyState = FakeWebSocket.CLOSED
      this.emit('close')
    }

    close(code?: number, reason?: string): void {
      this.lastClose = { code, reason }
      this.readyState = FakeWebSocket.CLOSED
      this.emit('close', code, reason)
    }
  }

  class FakeWebSocketServer extends EventEmitter {
    close(callback?: () => void): void {
      callback?.()
    }
  }

  return {
    WebSocket: FakeWebSocket,
    WebSocketServer: FakeWebSocketServer,
  }
})

class InMemoryBroker implements PubSubBroker {
  public readonly handlers = new Map<string, Set<BrokerMessageHandler>>()
  public readonly subscribeCalls: string[] = []
  public readonly unsubscribeCalls: string[] = []
  public publishCalls: Array<{ channel: string; message: string }> = []

  async subscribe(channel: string, handler: BrokerMessageHandler): Promise<void> {
    let set = this.handlers.get(channel)
    if (!set) {
      set = new Set()
      this.handlers.set(channel, set)
      this.subscribeCalls.push(channel)
    }
    set.add(handler)
  }

  async unsubscribe(channel: string, handler: BrokerMessageHandler): Promise<void> {
    const set = this.handlers.get(channel)
    if (!set) {
      return
    }
    set.delete(handler)
    if (set.size === 0) {
      this.handlers.delete(channel)
      this.unsubscribeCalls.push(channel)
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    this.publishCalls.push({ channel, message })
    const set = this.handlers.get(channel)
    if (!set) {
      return
    }
    for (const handler of set) {
      handler(message)
    }
  }

  async close(): Promise<void> {
    this.handlers.clear()
  }
}

class StubHttpServer extends EventEmitter {
  address(): { address: string; port: number; family: string } {
    return { address: '127.0.0.1', port: 0, family: 'IPv4' }
  }

  close(callback?: (error?: Error) => void): void {
    callback?.()
  }
}

interface FakeSocket extends EventEmitter {
  readyState: number
  sent: unknown[]
  pingCount: number
  autoPong: boolean
  lastClose?: { code?: number; reason?: string }
  close: (code?: number, reason?: string) => void
}

async function waitForSent(socket: FakeSocket): Promise<unknown> {
  if (socket.sent.length > 0) {
    return socket.sent.shift()
  }
  await new Promise<void>((resolve) => socket.once('sent', () => resolve()))
  return socket.sent.shift()
}

function getHandleConnection(gateway: RedisWebSocketGateway) {
  return Reflect.get(gateway, 'handleConnection') as (
    socket: FakeSocket,
    request: { socket: { remoteAddress?: string } },
  ) => Promise<void>
}

function getRunHeartbeatCheck(gateway: RedisWebSocketGateway) {
  return Reflect.get(gateway, 'runHeartbeatCheck') as () => Promise<void>
}

describe('RedisWebSocketGateway', () => {
  let broker: InMemoryBroker
  let server: StubHttpServer
  let gateway: RedisWebSocketGateway

  beforeEach(async () => {
    broker = new InMemoryBroker()
    server = new StubHttpServer()
    gateway = new RedisWebSocketGateway({ broker, server: server as unknown as any })
    await gateway.start()
  })

  afterEach(async () => {
    await gateway.stop()
  })

  async function connectClient(overrides: { remoteAddress?: string } = {}): Promise<FakeSocket> {
    const socket = new (WebSocket as unknown as new () => FakeSocket)()
    await getHandleConnection(gateway).call(gateway, socket, {
      socket: { remoteAddress: overrides.remoteAddress ?? '127.0.0.1' },
    })
    return socket
  }

  it('delivers published messages to subscribed clients', async () => {
    const client = await connectClient()

    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['room'] }))
    const ack = (await waitForSent(client)) as { type: string; action: string; channels: string[] }
    expect(ack).toEqual({ type: 'ack', action: 'subscribe', channels: ['room'] })

    await gateway.publish({ channel: 'room', payload: { hello: 'world' } })
    const message = (await waitForSent(client)) as { type: string; channel: string; payload: { hello: string } }
    expect(message.type).toBe('message')
    expect(message.channel).toBe('room')
    expect(message.payload).toEqual({ hello: 'world' })
  })

  it('returns null address before start and supports double start', async () => {
    const tempGateway = new RedisWebSocketGateway({
      broker: new InMemoryBroker(),
      server: new StubHttpServer() as unknown as any,
    })
    expect(tempGateway.address).toBeNull()
    await tempGateway.start()
    expect(tempGateway.address?.address).toBe('127.0.0.1')
    await tempGateway.start() // should be idempotent
    await tempGateway.stop()
  })

  it('throws when neither server nor port is provided', () => {
    expect(() => new RedisWebSocketGateway({ broker: new InMemoryBroker() } as any)).toThrow(
      'Either "server" or "port" must be provided to RedisWebSocketGateway',
    )
  })

  it('routes client initiated publish events through the broker', async () => {
    const client = await connectClient()
    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['chat'] }))
    await waitForSent(client)

    client.emit('message', JSON.stringify({ type: 'publish', channel: 'chat', payload: 'hello' }))
    const message = (await waitForSent(client)) as { channel: string; payload: string }
    expect(message.channel).toBe('chat')
    expect(message.payload).toBe('hello')
    expect(broker.publishCalls.at(-1)).toMatchObject({ channel: 'chat' })
  })

  it('rejects client publish when disabled', async () => {
    await gateway.stop()
    gateway = new RedisWebSocketGateway({ broker, server: server as unknown as any, allowClientPublish: false })
    await gateway.start()

    const client = await connectClient()

    client.emit('message', JSON.stringify({ type: 'publish', channel: 'chat', payload: 'hello' }))
    const error = (await waitForSent(client)) as { code: string }
    expect(error.code).toBe('CLIENT_PUBLISH_FORBIDDEN')
  })

  it('sends error for invalid payloads', async () => {
    const client = await connectClient()
    client.emit('message', 'not-json')
    const error = (await waitForSent(client)) as { code: string }
    expect(error.code).toBe('INVALID_MESSAGE')
  })

  it('handles malformed subscribe payloads', async () => {
    const client = await connectClient()

    client.emit('message', JSON.stringify({ type: 'subscribe', channels: 'oops' }))
    const error = (await waitForSent(client)) as { code: string }
    expect(error.code).toBe('INVALID_MESSAGE')

    client.emit('message', JSON.stringify({ type: 'unsubscribe', channels: 'oops' }))
    const error2 = (await waitForSent(client)) as { code: string }
    expect(error2.code).toBe('INVALID_MESSAGE')

    client.emit('message', JSON.stringify({ type: 'publish', channel: 123 }))
    const error3 = (await waitForSent(client)) as { code: string }
    expect(error3.code).toBe('INVALID_MESSAGE')
  })

  it('rejects messages with unknown or invalid types', async () => {
    const client = await connectClient()

    client.emit('message', JSON.stringify({ foo: 'bar' }))
    const missingType = (await waitForSent(client)) as { code: string }
    expect(missingType.code).toBe('INVALID_MESSAGE')

    client.emit('message', JSON.stringify({ type: 123 }))
    const nonStringType = (await waitForSent(client)) as { code: string }
    expect(nonStringType.code).toBe('INVALID_MESSAGE')

    client.emit('message', JSON.stringify({ type: 'unknown-kind' }))
    const unknown = (await waitForSent(client)) as { code: string }
    expect(unknown.code).toBe('INVALID_MESSAGE')
  })

  it('responds with pong when pinged by clients', async () => {
    const client = await connectClient()

    client.emit('message', JSON.stringify({ type: 'ping' }))
    const pong = (await waitForSent(client)) as { type: string }
    expect(pong.type).toBe('pong')
  })

  it('terminates clients failing heartbeat checks', async () => {
    const client = await connectClient()
    client.autoPong = false

    const clients = Reflect.get(gateway, 'clients') as Map<FakeSocket, { isAlive: boolean }>
    const connection = [...clients.values()][0]
    connection.isAlive = false

    await getRunHeartbeatCheck(gateway).call(gateway)

    expect(client.readyState).toBe((WebSocket as typeof WebSocket & { CLOSED: number }).CLOSED)
  })

  it('pings active clients during heartbeat checks', async () => {
    const client = await connectClient()
    const clients = Reflect.get(gateway, 'clients') as Map<FakeSocket, { isAlive: boolean }>
    const connection = [...clients.values()][0]
    expect(connection).toBeDefined()
    await getRunHeartbeatCheck(gateway).call(gateway)
    expect(client.pingCount).toBeGreaterThan(0)
  })

  it('honors handshake validators', async () => {
    await gateway.stop()
    gateway = new RedisWebSocketGateway({
      broker,
      server: server as unknown as any,
      handshakeValidator: () => {
        throw new Error('blocked')
      },
    })
    await gateway.start()

    const client = new (WebSocket as unknown as new () => FakeSocket)()
    await getHandleConnection(gateway).call(gateway, client, { socket: { remoteAddress: '127.0.0.1' } })

    expect(client.lastClose?.code).toBe(4001)
  })

  it('supports custom client identifiers', async () => {
    await gateway.stop()
    gateway = new RedisWebSocketGateway({
      broker,
      server: server as unknown as any,
      identifyClient: () => 'custom-client',
    })
    await gateway.start()

    const client = await connectClient()
    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['alpha'] }))
    await waitForSent(client)

    const clients = Reflect.get(gateway, 'clients') as Map<FakeSocket, { id: string }>
    const connection = [...clients.values()][0]
    expect(connection.id).toBe('custom-client')
  })

  it('unsubscribes channels when the final client disconnects', async () => {
    const client = await connectClient()
    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['updates'] }))
    await waitForSent(client)

    client.close()
    await delay(10)

    expect(broker.unsubscribeCalls).toContain('updates')
  })

  it('ignores duplicate subscriptions', async () => {
    const client = await connectClient()
    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['dupe'] }))
    await waitForSent(client)

    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['dupe'] }))
    // no ack should be queued because nothing new to subscribe
    await delay(10)
    expect(client.sent.length).toBe(0)
  })

  it('handles unsubscribe calls when channel state is absent', async () => {
    const client = await connectClient()
    client.emit('message', JSON.stringify({ type: 'unsubscribe', channels: ['ghost'] }))
    await delay(10)
    expect(client.sent.length).toBe(0)
  })

  it('dispatches unknown messages with explicit errors', async () => {
    const _client = await connectClient()
    const clients = Reflect.get(gateway, 'clients') as Map<FakeSocket, ClientConnection>
    const connection = [...clients.values()][0]
    const dispatch = Reflect.get(gateway, 'dispatchClientMessage') as (
      target: ClientConnection,
      message: any,
    ) => Promise<void>
    await dispatch.call(gateway, connection!, { type: 'mystery' })
    const error = (await waitForSent(connection!.socket as unknown as FakeSocket)) as { code: string }
    expect(error.code).toBe('UNKNOWN_MESSAGE_TYPE')
  })

  it('handles broker subscribe failures and reports processing errors', async () => {
    const failingBroker: PubSubBroker = {
      subscribe: () => Promise.reject(new Error('fail')),
      unsubscribe: async () => {},
      publish: async () => {},
      close: async () => {},
    }
    const tempGateway = new RedisWebSocketGateway({ broker: failingBroker, server: server as unknown as any })
    await tempGateway.start()
    const client = new (WebSocket as unknown as new () => FakeSocket)()
    await getHandleConnection(tempGateway).call(tempGateway, client, { socket: { remoteAddress: '127.0.0.1' } })

    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['broken'] }))
    const error = (await waitForSent(client)) as { code: string }
    expect(error.code).toBe('MESSAGE_PROCESSING_FAILED')
    await tempGateway.stop()
  })

  it('logs websocket server errors and client socket errors', async () => {
    const client = await connectClient()
    const wss = Reflect.get(gateway, 'wss') as EventEmitter
    wss.emit('error', new Error('boom'))
    client.emit('error', new Error('client boom'))
  })

  it('handles broker messages with invalid payloads gracefully', async () => {
    const client = await connectClient()
    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['notify'] }))
    await waitForSent(client)

    const dispatch = Reflect.get(gateway, 'dispatchBrokerMessage') as (
      channel: string,
      payload: string,
    ) => Promise<void>
    await dispatch.call(gateway, 'notify', 'not-json')
    await dispatch.call(gateway, 'notify', JSON.stringify({ foo: 'bar' }))
    await dispatch.call(gateway, 'notify', JSON.stringify({ payload: 'ok' }))

    const sent = (client as FakeSocket).sent.find((msg) => (msg as any).type === 'message') as
      | { channel: string; payload: string }
      | undefined
    expect(sent?.payload).toBe('ok')
  })

  it('avoids sending messages to closed sockets', async () => {
    const _client = await connectClient()
    const clients = Reflect.get(gateway, 'clients') as Map<FakeSocket, ClientConnection>
    const connection = [...clients.values()][0]!
    ;(connection.socket as unknown as FakeSocket).readyState = (
      WebSocket as typeof WebSocket & { CLOSED: number }
    ).CLOSED
    const send = Reflect.get(gateway, 'send') as (target: ClientConnection, message: ServerMessage) => void
    send.call(gateway, connection, { type: 'pong', timestamp: Date.now() })
    expect((connection.socket as unknown as FakeSocket).sent).toHaveLength(0)
  })

  it('handles disconnects invoked multiple times', async () => {
    const _client = await connectClient()
    const clients = Reflect.get(gateway, 'clients') as Map<FakeSocket, ClientConnection>
    const connection = [...clients.values()][0]!
    const disconnect = Reflect.get(gateway, 'handleDisconnect') as (target: ClientConnection) => Promise<void>
    await disconnect.call(gateway, connection)
    await disconnect.call(gateway, connection)
  })

  it('allows shutting down with outstanding channel subscriptions', async () => {
    const client = await connectClient()
    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['shutdown'] }))
    await waitForSent(client)
    await gateway.stop()
    // restart gateway for remaining tests
    gateway = new RedisWebSocketGateway({ broker, server: server as unknown as any })
    await gateway.start()
  })

  it('handles broker publish enveloped messages without origin', async () => {
    const client = await connectClient()
    client.emit('message', JSON.stringify({ type: 'subscribe', channels: ['broadcast'] }))
    await waitForSent(client)

    const dispatch = Reflect.get(gateway, 'dispatchBrokerMessage') as (
      channel: string,
      payload: string,
    ) => Promise<void>
    await dispatch.call(gateway, 'broadcast', JSON.stringify({ payload: 'news', timestamp: 1 }))
    const payload = (client.sent.pop() as { channel: string; origin: string }) ?? { origin: '' }
    expect(payload.origin).toBe('unknown')
  })

  it('returns null when underlying server reports a string address', async () => {
    const customServer = new StubHttpServer()
    ;(customServer as unknown as { address: () => any }).address = () => 'pipe'
    const tempGateway = new RedisWebSocketGateway({
      broker: new InMemoryBroker(),
      server: customServer as unknown as any,
    })
    await tempGateway.start()
    expect(tempGateway.address).toBeNull()
    await tempGateway.stop()
  })

  it('parses buffer payloads', async () => {
    const client = await connectClient()
    const buffer = Buffer.from(JSON.stringify({ type: 'ping' }))
    client.emit('message', buffer)
    const pong = (await waitForSent(client)) as { type: string }
    expect(pong.type).toBe('pong')
  })
})
