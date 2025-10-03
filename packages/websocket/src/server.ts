import { randomUUID } from 'node:crypto'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { PrettyLogger } from '@hono-template/framework'
import { createLogger } from '@hono-template/framework'
import type { WebSocketServer as NodeWebSocketServer } from 'ws'
import { WebSocket, WebSocketServer } from 'ws'

import type {
  ChannelEnvelope,
  ChannelMessage,
  ChannelState,
  ClientConnection,
  ClientMessage,
  PubSubBroker,
  ServerMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  WebSocketGatewayOptions,
  WebSocketGatewayPublishOptions,
} from './types'

const DEFAULT_PATH = '/ws'
const DEFAULT_HEARTBEAT_INTERVAL = 30_000

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseClientMessage(raw: WebSocket.RawData): ClientMessage | undefined {
  const text = typeof raw === 'string' ? raw : raw.toString()
  try {
    const payload = JSON.parse(text)
    if (!isObjectLike(payload) || typeof payload.type !== 'string') {
      return undefined
    }

    switch (payload.type) {
      case 'subscribe': {
        if (!Array.isArray(payload.channels) || payload.channels.some((c) => typeof c !== 'string')) {
          return undefined
        }
        return { type: 'subscribe', channels: payload.channels }
      }
      case 'unsubscribe': {
        if (!Array.isArray(payload.channels) || payload.channels.some((c) => typeof c !== 'string')) {
          return undefined
        }
        return { type: 'unsubscribe', channels: payload.channels }
      }
      case 'publish': {
        if (typeof payload.channel !== 'string') {
          return undefined
        }
        return { type: 'publish', channel: payload.channel, payload: payload.payload }
      }
      case 'ping': {
        return { type: 'ping' }
      }
      default: {
        return undefined
      }
    }
  } catch {
    return undefined
  }
}

function serializeMessage(message: ServerMessage): string {
  return JSON.stringify(message)
}

export class RedisWebSocketGateway {
  private readonly broker: PubSubBroker
  private readonly logger: PrettyLogger
  private readonly allowClientPublish: boolean
  private readonly heartbeatInterval: number
  private readonly path: string
  private httpServer: HttpServer | undefined
  private wss: NodeWebSocketServer | undefined
  private heartbeatTimer?: NodeJS.Timeout
  private readonly clients = new Map<WebSocket, ClientConnection>()
  private readonly channels = new Map<string, ChannelState>()
  private readonly serverId = randomUUID()
  private started = false
  private readonly identifyClient: Required<WebSocketGatewayOptions>['identifyClient']

  constructor(private readonly options: WebSocketGatewayOptions) {
    this.logger = options.logger ?? createLogger('WebSocketGateway')
    this.broker = options.broker
    this.allowClientPublish = options.allowClientPublish ?? true
    this.heartbeatInterval = Math.max(1_000, options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL)
    this.path = options.path ?? DEFAULT_PATH
    this.identifyClient =
      options.identifyClient ??
      (() => {
        return randomUUID()
      })

    if (!options.server && options.port === undefined) {
      throw new Error('Either "server" or "port" must be provided to RedisWebSocketGateway')
    }
  }

  get address(): AddressInfo | null {
    if (!this.httpServer) {
      return null
    }
    const address = this.httpServer.address()
    return typeof address === 'object' ? address : null
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true

    if (this.options.server) {
      this.httpServer = this.options.server
    } /* c8 ignore start */ else {
      this.httpServer = createServer()
      const port = this.options.port ?? 0
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.once('error', reject)
        this.httpServer!.listen(port, '127.0.0.1', () => resolve())
      })
    } /* c8 ignore end */

    this.wss = new WebSocketServer({
      server: this.httpServer,
      path: this.path,
    })

    this.wss.on('connection', (socket, request) => {
      void this.handleConnection(socket, request)
    })

    this.wss.on('error', (error) => {
      this.logger.error('WebSocket server error', error)
    })

    this.heartbeatTimer = setInterval(() => {
      this.runHeartbeatCheck().catch((error) => {
        this.logger.error('Heartbeat check failed', error)
      })
    }, this.heartbeatInterval)

    this.logger.info('WebSocket gateway started', {
      path: this.path,
      port: this.address?.port,
    })
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return
    }

    this.started = false

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }

    for (const client of this.clients.values()) {
      client.socket.terminate()
    }
    this.clients.clear()

    for (const [channel, state] of this.channels) {
      this.channels.delete(channel)
      await this.broker.unsubscribe(channel, state.handler)
    }

    if (this.wss) {
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()))
      this.wss = undefined
    }

    if (this.options.server) {
      // If server provided externally, do not close it.
    } else if (this.httpServer) {
      /* c8 ignore start */
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
      /* c8 ignore end */
    }

    this.httpServer = undefined
    await this.broker.close()
  }

  async publish<TPayload>(options: WebSocketGatewayPublishOptions<TPayload>): Promise<void> {
    const envelope: ChannelEnvelope<TPayload> = {
      payload: options.payload,
      origin: this.serverId,
      timestamp: Date.now(),
    }

    await this.broker.publish(options.channel, JSON.stringify(envelope))
  }

  private async handleConnection(socket: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      await this.options.handshakeValidator?.(request)
    } catch (error) {
      this.logger.warn('Connection rejected during handshake validation', error)
      socket.close(4001, 'handshake rejected')
      return
    }

    const identifier = await Promise.resolve(this.identifyClient(request))

    const client: ClientConnection = {
      id: identifier,
      socket,
      channels: new Set(),
      isAlive: true,
    }

    this.clients.set(socket, client)

    socket.on('message', (data) => {
      const message = parseClientMessage(data)
      if (!message) {
        this.send(client, {
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: 'Unable to parse incoming message',
        })
        return
      }

      void this.dispatchClientMessage(client, message).catch((error) => {
        this.logger.error('Failed to process client message', error)
        this.send(client, {
          type: 'error',
          code: 'MESSAGE_PROCESSING_FAILED',
          message: 'Failed to process client message',
        })
      })
    })

    socket.on('pong', () => {
      client.isAlive = true
    })

    socket.on('close', () => {
      void this.handleDisconnect(client)
    })

    socket.on('error', (error) => {
      this.logger.warn('Client socket error', error)
    })

    this.logger.info('Client connected', {
      clientId: client.id,
      address: request.socket.remoteAddress,
    })
  }

  private async dispatchClientMessage(client: ClientConnection, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'subscribe': {
        await this.handleSubscribe(client, message)
        break
      }
      case 'unsubscribe': {
        await this.handleUnsubscribe(client, message)
        break
      }
      case 'publish': {
        if (!this.allowClientPublish) {
          this.send(client, {
            type: 'error',
            code: 'CLIENT_PUBLISH_FORBIDDEN',
            message: 'Client initiated publish is disabled',
          })
          return
        }
        await this.publish({ channel: message.channel, payload: message.payload })
        break
      }
      case 'ping': {
        this.send(client, { type: 'pong', timestamp: Date.now() })
        break
      }
      default: {
        this.send(client, {
          type: 'error',
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unsupported message type ${(message as { type: string }).type}`,
        })
        break
      }
    }
  }

  private async handleSubscribe(client: ClientConnection, message: SubscribeMessage): Promise<void> {
    const channels = message.channels.filter((channel) => !client.channels.has(channel))
    if (channels.length === 0) {
      return
    }

    await Promise.all(
      channels.map(async (channel) => {
        let state = this.channels.get(channel)
        if (!state) {
          const handler = (payload: string) => this.dispatchBrokerMessage(channel, payload)
          state = { clients: new Set(), handler }
          state.subscriptionPromise = this.broker.subscribe(channel, handler).catch((error) => {
            this.logger.error('Failed to subscribe to channel %s', channel, error)
            this.channels.delete(channel)
            throw error
          })
          this.channels.set(channel, state)
        }

        if (state.subscriptionPromise) {
          await state.subscriptionPromise
          state.subscriptionPromise = undefined
        }

        state.clients.add(client)
        client.channels.add(channel)
      }),
    )

    this.send(client, {
      type: 'ack',
      action: 'subscribe',
      channels,
    })

    this.logger.debug('Client subscribed', {
      clientId: client.id,
      channels,
    })
  }

  private async handleUnsubscribe(client: ClientConnection, message: UnsubscribeMessage): Promise<void> {
    const channels = message.channels.filter((channel) => client.channels.has(channel))
    if (channels.length === 0) {
      return
    }

    await Promise.all(
      channels.map(async (channel) => {
        const state = this.channels.get(channel)
        if (!state) {
          client.channels.delete(channel)
          return
        }

        state.clients.delete(client)
        client.channels.delete(channel)

        if (state.clients.size === 0) {
          this.channels.delete(channel)
          await this.broker.unsubscribe(channel, state.handler)
        }
      }),
    )

    this.send(client, {
      type: 'ack',
      action: 'unsubscribe',
      channels,
    })

    this.logger.debug('Client unsubscribed', {
      clientId: client.id,
      channels,
    })
  }

  private async handleDisconnect(client: ClientConnection): Promise<void> {
    if (!this.clients.delete(client.socket)) {
      return
    }

    await Promise.all(
      [...client.channels].map(async (channel) => {
        const state = this.channels.get(channel)
        if (!state) {
          return
        }

        state.clients.delete(client)
        if (state.clients.size === 0) {
          this.channels.delete(channel)
          await this.broker.unsubscribe(channel, state.handler)
        }
      }),
    )

    this.logger.info('Client disconnected', { clientId: client.id })
  }

  private async dispatchBrokerMessage(channel: string, payload: string): Promise<void> {
    let envelope: ChannelEnvelope
    try {
      envelope = JSON.parse(payload)
    } catch (error) {
      this.logger.warn('Failed to parse broker payload for channel %s', channel, error)
      return
    }

    if (!isObjectLike(envelope) || !('payload' in envelope)) {
      this.logger.warn('Invalid broker payload received', { channel })
      return
    }

    const message: ChannelMessage = {
      type: 'message',
      channel,
      payload: envelope.payload,
      origin: envelope.origin ?? 'unknown',
      timestamp: envelope.timestamp ?? Date.now(),
    }

    const state = this.channels.get(channel)
    if (!state) {
      return
    }

    for (const client of state.clients) {
      this.send(client, message)
    }
  }

  private send(client: ClientConnection, message: ServerMessage): void {
    if (client.socket.readyState !== WebSocket.OPEN) {
      return
    }

    client.socket.send(serializeMessage(message))
  }

  private async runHeartbeatCheck(): Promise<void> {
    for (const client of this.clients.values()) {
      if (!client.isAlive) {
        client.socket.terminate()
        await this.handleDisconnect(client)
        continue
      }

      client.isAlive = false
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.ping()
      }
    }
  }
}

export type { WebSocketGatewayOptions, WebSocketGatewayPublishOptions } from './types'
