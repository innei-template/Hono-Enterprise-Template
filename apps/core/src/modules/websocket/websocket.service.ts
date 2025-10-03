import { createLogger, InternalServerErrorException } from '@hono-template/framework'
import { injectable } from 'tsyringe'

import { WebSocketGatewayProvider } from './websocket.provider'

const logger = createLogger('WebSocket:Publisher')

@injectable()
export class WebSocketPublisherService {
  constructor(private readonly gatewayProvider: WebSocketGatewayProvider) {}

  async publish(channel: string, payload: unknown): Promise<void> {
    const gateway = this.gatewayProvider.getGateway()
    if (!gateway) {
      throw new InternalServerErrorException('WebSocket gateway is not currently active')
    }

    await gateway.publish({ channel, payload })
    logger.debug('Published message to channel', { channel })
  }
}
