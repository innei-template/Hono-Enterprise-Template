// Client <-> Server message contracts (mirrors @hono-template/websocket)

export type ClientMessage = SubscribeMessage | UnsubscribeMessage | PublishMessage | PingMessage

export interface SubscribeMessage {
  type: 'subscribe'
  channels: string[]
}

export interface UnsubscribeMessage {
  type: 'unsubscribe'
  channels: string[]
}

export interface PublishMessage<TPayload = unknown> {
  type: 'publish'
  channel: string
  payload: TPayload
}

export interface PingMessage {
  type: 'ping'
}

export type ServerMessage<TPayload = unknown> = AckMessage | ErrorMessage | ChannelMessage<TPayload> | PongMessage

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

export interface WebSocketInfo {
  port: number
  path: string
  heartbeatIntervalMs: number
}
