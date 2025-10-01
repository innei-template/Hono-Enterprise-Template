import { Module } from '@hono-template/framework'

import { ApiKeyGuard } from '../../guards/api-key.guard'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { ParseIntPipe } from './pipes/parse-int.pipe'

@Module({
  controllers: [AppController],
  providers: [AppService, ParseIntPipe, ApiKeyGuard],
})
export class AppModule {}
