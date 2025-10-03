import type { IncomingMessage, Server } from 'node:http'

import type { PrettyLogger } from '@hono-template/framework'

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | PublishMessage | PingMessage

export interface SubscribeMessage {
  type: 'subscribe'
  channels: string[]
}

export interface UnsubscribeMessage {
  type: 'unsubscribe'
  channels: string[]
}

export interface PublishMessage {
  type: 'publish'
  channel: string
  payload: unknown
}

export interface PingMessage {
  type: 'ping'
}

export type ServerMessage = AckMessage | ErrorMessage | ChannelMessage | PongMessage

export interface AckMessage {
  type: 'ack'
  action: 'subscribe' | 'unsubscribe'
  channels: string[]
}

export interface ErrorMessage {
  type: 'error'
  code: string
  message: string
}

export interface PongMessage {
  type: 'pong'
  timestamp: number
}

export interface ChannelMessage<TPayload = unknown> {
  type: 'message'
  channel: string
  payload: TPayload
  origin: string
  timestamp: number
}

export interface ChannelEnvelope<TPayload = unknown> {
  payload: TPayload
  origin: string
  timestamp: number
}

export type BrokerMessageHandler = (message: string) => void

export interface PubSubBroker {
  subscribe: (channel: string, handler: BrokerMessageHandler) => Promise<void>
  unsubscribe: (channel: string, handler: BrokerMessageHandler) => Promise<void>
  publish: (channel: string, message: string) => Promise<void>
  close: () => Promise<void>
}

export interface WebSocketGatewayOptions {
  broker: PubSubBroker
  server?: Server
  port?: number
  path?: string
  logger?: PrettyLogger
  heartbeatIntervalMs?: number
  allowClientPublish?: boolean
  handshakeValidator?: (request: IncomingMessage) => Promise<void> | void
  identifyClient?: (request: IncomingMessage) => string | Promise<string>
}

export interface WebSocketGatewayPublishOptions<TPayload = unknown> {
  channel: string
  payload: TPayload
}

export interface ClientConnection {
  id: string
  socket: import('ws').WebSocket
  channels: Set<string>
  isAlive: boolean
}

export interface ChannelState {
  clients: Set<ClientConnection>
  handler: BrokerMessageHandler
  subscriptionPromise?: Promise<void>
}
