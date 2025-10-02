import { Body, Controller, Get, NotFoundException, Param, Post } from '@hono-template/framework'
import { injectable } from 'tsyringe'

import { EnqueueNotificationDto } from './schemas/enqueue-notification.schema'
import { TaskQueueDemoService } from './task-queue.service'

@Controller('queue')
@injectable()
export class TaskQueueDemoController {
  constructor(private readonly service: TaskQueueDemoService) {}

  @Post('jobs')
  async enqueueJob(@Body() payload: EnqueueNotificationDto): Promise<Response> {
    const job = await this.service.enqueueNotification(payload)
    const response = {
      jobId: job.jobId,
      status: job.status,
      queuedAt: job.queuedAt,
      scheduledFor: job.scheduledFor,
    }

    return new Response(JSON.stringify(response), {
      status: 202,
      headers: {
        'content-type': 'application/json',
      },
    })
  }

  @Get('jobs')
  listJobs() {
    return this.service.listJobs()
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    const job = this.service.getJob(id)
    if (!job) {
      throw new NotFoundException('Queued job not found')
    }

    return job
  }

  @Get('stats')
  async getStats() {
    return await this.service.getQueueStats()
  }
}
