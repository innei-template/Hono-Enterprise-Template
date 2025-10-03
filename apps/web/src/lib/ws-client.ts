import type { ClientMessage, ServerMessage, WebSocketInfo } from '../types/ws'

export interface WebClientOptions {
  buildWsUrl?: (info: WebSocketInfo) => string
}

export class WebSocketClient {
  private socket: WebSocket | null = null
  private readonly listeners = new Set<(message: ServerMessage) => void>()
  private readonly options: WebClientOptions

  constructor(options: WebClientOptions = {}) {
    this.options = options
  }

  async connect(): Promise<void> {
    const info = await this.fetchInfo()
    const url = this.options.buildWsUrl?.(info) ?? this.defaultUrl(info)

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url)
      this.socket = socket
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', (event) => reject(event), { once: true })
      socket.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(String(event.data)) as ServerMessage
          this.listeners.forEach((fn) => fn(data))
        } catch {
          // ignore
        }
      })
    })
  }

  async disconnect(): Promise<void> {
    if (!this.socket) return
    await new Promise<void>((resolve) => {
      this.socket!.addEventListener('close', () => resolve(), { once: true })
      this.socket!.close()
      this.socket = null
    })
  }

  subscribe(handler: (message: ServerMessage) => void): () => void {
    this.listeners.add(handler)
    return () => this.listeners.delete(handler)
  }

  send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(message))
  }

  private async fetchInfo(): Promise<WebSocketInfo> {
    const res = await fetch('/api/websocket/info')
    if (!res.ok) throw new Error('Failed to get websocket info')
    const body = await res.json()
    // The server response is transformed by ResponseTransformInterceptor; unwrap if present
    return 'data' in body ? (body.data as WebSocketInfo) : (body as WebSocketInfo)
  }

  private defaultUrl(info: WebSocketInfo): string {
    const isHttps = globalThis.location.protocol === 'https:'
    const wsProtocol = isHttps ? 'wss' : 'ws'
    const host = globalThis.location.hostname
    // Core server may be on a different port; use info.port when provided.
    const port = info.port || 3000
    const path = info.path || '/ws'
    return `${wsProtocol}://${host}:${port}${path}`
  }
}
