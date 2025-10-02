import { Module } from '@hono-template/framework'

import { ParseIntPipe } from '../../pipes/parse-int.pipe'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
  controllers: [AppController],
  providers: [AppService, ParseIntPipe],
})
export class AppModule {}
