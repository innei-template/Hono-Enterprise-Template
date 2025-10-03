import { Module } from '@hono-template/framework'

import { DatabaseModule } from '../database/database.module'
import { RedisModule } from '../redis/redis.module'
import { AppModule } from './app/app.module'
import { AuthModule } from './auth/auth.module'
import { TaskQueueDemoModule } from './task-queue/task-queue.module'

@Module({
  imports: [DatabaseModule, RedisModule, TaskQueueDemoModule, AppModule, AuthModule],
})
export class AppModules {}
