import { env } from '@hono-template/env'
import { injectable } from 'tsyringe'

const DEFAULT_WS_PATH = '/ws'
const DEFAULT_WS_PORT = env.WS_PORT
const DEFAULT_HEARTBEAT_INTERVAL = 30_000

@injectable()
export class WebSocketConfig {
  private readonly port = DEFAULT_WS_PORT
  private readonly path = DEFAULT_WS_PATH
  private readonly heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL

  getPort(): number {
    return this.port
  }

  getPath(): string {
    return this.path
  }

  getHeartbeatInterval(): number {
    return this.heartbeatInterval
  }
}
