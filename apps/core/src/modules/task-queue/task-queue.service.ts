import type { PrettyLogger } from '@hono-template/framework'
import { createLogger } from '@hono-template/framework'
import type { TaskContext } from '@hono-template/task-queue'
import { RedisQueueDriver, TaskQueue, TaskQueueManager } from '@hono-template/task-queue'
import { injectable } from 'tsyringe'

import { RedisAccessor } from '../../redis/redis.provider'
import { WebSocketPublisherService } from '../websocket/websocket.service'
import type { EnqueueNotificationInput } from './schemas/enqueue-notification.schema'

const QUEUE_KEY = 'core-notifications'
const REDIS_STREAM = 'core:notifications'
const MAX_ATTEMPTS = 5

export type JobStatus = 'pending' | 'processing' | 'retrying' | 'completed' | 'failed'

export interface DemoJobState {
  id: string
  status: JobStatus
  attempts: number
  queuedAt: string
  lastUpdatedAt: string
  payload: EnqueueNotificationInput
  scheduledFor?: string
  lastError?: string
  result?: {
    deliveredAt: string
    channel: string
    metadata?: Record<string, unknown>
  }
}

@injectable()
export class TaskQueueDemoService {
  private readonly logger: PrettyLogger = createLogger('TaskQueueDemo')
  private readonly queue: TaskQueue
  private readonly jobs = new Map<string, DemoJobState>()

  constructor(
    private readonly manager: TaskQueueManager,
    private readonly redisAccessor: RedisAccessor,
    private readonly wsPublisher: WebSocketPublisherService,
  ) {
    const existingQueue = this.manager.getQueue(QUEUE_KEY)
    if (existingQueue) {
      this.queue = existingQueue
      this.logger.info('Reusing existing task queue instance', `queue=${QUEUE_KEY}`)
    } else {
      const driver = new RedisQueueDriver({
        queueName: REDIS_STREAM,
        redis: this.redisAccessor.get(),
        visibilityTimeoutMs: 45_000,
      })

      this.queue = this.manager.createQueue(QUEUE_KEY, {
        start: false,
        driver,
        logger: this.logger.extend('Queue'),
        middlewares: [this.createAuditMiddleware()],
      })

      this.registerHandlers()
      void this.queue.start({ pollIntervalMs: 200 })
      this.logger.info('Redis-backed task queue ready', `queue=${QUEUE_KEY}`)
    }
  }

  async enqueueNotification(
    payload: EnqueueNotificationInput,
  ): Promise<{ jobId: string; status: JobStatus } & DemoJobState> {
    const now = new Date()
    const runAt = payload.delaySeconds ? now.getTime() + payload.delaySeconds * 1000 : undefined

    const job = await this.queue.enqueue({
      name: 'send-notification',
      payload,
      runAt,
      priority: payload.priority ?? 0,
    })

    const state: DemoJobState = {
      id: job.id,
      status: 'pending',
      attempts: 0,
      queuedAt: now.toISOString(),
      lastUpdatedAt: now.toISOString(),
      scheduledFor: runAt ? new Date(runAt).toISOString() : undefined,
      payload,
    }

    this.jobs.set(job.id, state)
    this.logger.info('Enqueued notification task', `id=${job.id}`, `recipient=${payload.recipient}`)
    return { jobId: job.id, ...state }
  }

  listJobs(): DemoJobState[] {
    return [...this.jobs.values()].sort((a, b) => (a.queuedAt < b.queuedAt ? 1 : -1))
  }

  getJob(id: string): DemoJobState | undefined {
    const state = this.jobs.get(id)
    if (!state) {
      return undefined
    }

    return { ...state, payload: { ...state.payload } }
  }

  async getQueueStats(): Promise<{
    queued: number
    inFlight: number
    scheduled: number
    trackedJobs: number
  }> {
    const stats = await this.queue.getStats()
    return {
      ...stats,
      trackedJobs: this.jobs.size,
    }
  }

  private registerHandlers(): void {
    this.queue.registerHandler('send-notification', this.processNotification.bind(this), {
      maxAttempts: MAX_ATTEMPTS,
      retryableFilter: () => true,
      backoffStrategy: (attempt) => Math.min(30_000, 2 ** attempt * 250),
    })
  }

  private createAuditMiddleware() {
    return async (context: TaskContext, next: () => Promise<void>) => {
      this.logger.debug('Executing task', `id=${context.taskId}`, `name=${context.name}`)
      await next()
      this.logger.debug('Task completed', `id=${context.taskId}`, `name=${context.name}`)
    }
  }

  private async processNotification(
    payload: EnqueueNotificationInput,
    context: TaskContext<EnqueueNotificationInput>,
  ): Promise<void> {
    const now = new Date().toISOString()
    const current = this.jobs.get(context.taskId)
    const baseState: DemoJobState = current ?? {
      id: context.taskId,
      status: 'processing',
      attempts: context.metadata.attempts,
      queuedAt: now,
      lastUpdatedAt: now,
      payload,
    }

    const workingState: DemoJobState = {
      ...baseState,
      status: 'processing',
      attempts: context.metadata.attempts,
      lastUpdatedAt: now,
      payload,
      lastError: undefined,
    }
    this.jobs.set(context.taskId, workingState)

    // Simulate workload latency
    await new Promise((resolve) => setTimeout(resolve, 25))

    const requiredFailures = payload.attemptsBeforeSuccess ?? 0
    if (context.metadata.attempts <= requiredFailures) {
      const willRetry = context.metadata.attempts < MAX_ATTEMPTS
      this.jobs.set(context.taskId, {
        ...workingState,
        status: willRetry ? 'retrying' : 'failed',
        lastUpdatedAt: new Date().toISOString(),
        lastError: 'Simulated transient failure',
      })
      throw new Error('Simulated transient failure')
    }

    const result = {
      deliveredAt: new Date().toISOString(),
      channel: payload.channel ?? 'email',
      metadata: payload.metadata,
    }

    const finalState: DemoJobState = {
      ...workingState,
      status: 'completed',
      lastUpdatedAt: result.deliveredAt,
      result,
    }

    this.jobs.set(context.taskId, finalState)

    // Broadcast job completion via WebSocket channel derived from task channel
    const channel = `queue:${result.channel}`
    await this.wsPublisher.publish(channel, {
      type: 'job.completed',
      id: finalState.id,
      status: finalState.status,
      attempts: finalState.attempts,
      deliveredAt: result.deliveredAt,
      recipient: payload.recipient,
    })
  }
}
