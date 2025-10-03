import { Module } from '@hono-template/framework'

import { RedisModule } from '../../redis/redis.module'
import { WebSocketConfig } from './websocket.config'
import { WebSocketDemoController } from './websocket.controller'
import { WebSocketGatewayProvider } from './websocket.provider'
import { WebSocketPublisherService } from './websocket.service'

@Module({
  imports: [RedisModule],
  controllers: [WebSocketDemoController],
  providers: [WebSocketConfig, WebSocketGatewayProvider, WebSocketPublisherService],
})
export class WebSocketDemoModule {}
