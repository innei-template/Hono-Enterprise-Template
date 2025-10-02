import { Module } from '@hono-template/framework'

import { DatabaseModule } from '../database/module'
import { RedisModule } from '../redis/module'
import { AppModule } from './app/app.module'

@Module({
  imports: [DatabaseModule, RedisModule, AppModule],
})
export class AppModules {}
