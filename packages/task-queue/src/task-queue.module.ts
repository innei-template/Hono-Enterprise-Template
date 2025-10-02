import { Module } from '@hono-template/framework'

import { TaskQueueManager } from './task-queue.manager'

@Module({
  providers: [TaskQueueManager],
})
export class TaskQueueModule {}
