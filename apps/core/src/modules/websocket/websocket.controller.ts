import { env } from '@hono-template/env'
import { Body, Controller, Get, Param, Post } from '@hono-template/framework'
import { injectable } from 'tsyringe'

import { PublishMessageDto } from './schemas/publish-message.schema'
import { WebSocketConfig } from './websocket.config'
import { WebSocketGatewayProvider } from './websocket.provider'
import { WebSocketPublisherService } from './websocket.service'

@Controller('websocket')
@injectable()
export class WebSocketDemoController {
  constructor(
    private readonly publisher: WebSocketPublisherService,
    private readonly config: WebSocketConfig,
    private readonly gatewayProvider: WebSocketGatewayProvider,
  ) {}

  @Post('channels/:channel/publish')
  async publishMessage(@Param('channel') channel: string, @Body() body: PublishMessageDto): Promise<Response> {
    await this.publisher.publish(channel, body.payload)
    return new Response(JSON.stringify({ channel, status: 'accepted' }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    })
  }

  @Get('info')
  getInfo() {
    const isHttpAttached = this.gatewayProvider.getIsHttpAttached()

    return {
      port: isHttpAttached ? env.PORT : this.config.getPort(),
      path: this.config.getPath(),
      heartbeatIntervalMs: this.config.getHeartbeatInterval(),
    }
  }
}
