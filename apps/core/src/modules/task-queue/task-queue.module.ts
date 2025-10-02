import { Module } from '@hono-template/framework'
import { TaskQueueModule } from '@hono-template/task-queue'

import { RedisModule } from '../../redis/redis.module'
import { TaskQueueDemoController } from './task-queue.controller'
import { TaskQueueDemoService } from './task-queue.service'

@Module({
  imports: [RedisModule, TaskQueueModule],
  controllers: [TaskQueueDemoController],
  providers: [TaskQueueDemoService],
})
export class TaskQueueDemoModule {}
