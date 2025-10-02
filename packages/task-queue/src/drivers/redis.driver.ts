/* c8 ignore file */
import { randomUUID } from 'node:crypto'

import type { Redis } from 'ioredis'

import type { DriverTask, PollOptions, TaskQueueDriver, TaskQueueStats } from '../types'

export interface RedisDriverOptions {
  queueName: string
  groupName?: string
  consumerName?: string
  visibilityTimeoutMs?: number
  scheduledKeySuffix?: string
  redis: Redis
}

const DEFAULT_VISIBILITY = 30_000

export class RedisQueueDriver implements TaskQueueDriver {
  private readonly streamKey: string
  private readonly scheduledKey: string
  private readonly groupName: string
  private readonly consumerName: string
  private readonly visibilityTimeout: number

  constructor(private readonly options: RedisDriverOptions) {
    this.streamKey = `queue:${options.queueName}:stream`
    this.scheduledKey = `queue:${options.queueName}:scheduled`
    this.groupName = options.groupName ?? `${options.queueName}:group`
    this.consumerName = options.consumerName ?? randomUUID()
    this.visibilityTimeout = options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY
  }

  async ensureGroup(): Promise<void> {
    try {
      await this.options.redis.xgroup('CREATE', this.streamKey, this.groupName, '$', 'MKSTREAM')
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) {
        throw error
      }
    }
  }

  async enqueue<TPayload>(task: DriverTask<TPayload>): Promise<void> {
    const payload = JSON.stringify(task)
    if (task.runAt > Date.now()) {
      await this.options.redis.zadd(this.scheduledKey, task.runAt, payload)
      return
    }

    await this.options.redis.xadd(this.streamKey, '*', 'payload', payload)
  }

  async reschedule<TPayload>(task: DriverTask<TPayload>, runAt: number): Promise<void> {
    const updated: DriverTask<TPayload> = {
      ...task,
      runAt,
    }

    await this.enqueue(updated)
  }

  async poll(options: PollOptions): Promise<DriverTask | null> {
    await this.ensureGroup()
    await this.releaseScheduled(Date.now())
    await this.reclaimExpired()

    const blockMs = Math.max(0, options.timeoutMs)
    const entries = await this.options.redis.xreadgroup(
      'GROUP',
      this.groupName,
      this.consumerName,
      'COUNT',
      1,
      'BLOCK',
      blockMs,
      'STREAMS',
      this.streamKey,
      '>',
    )

    if (!entries || entries.length === 0) {
      return null
    }

    const [, messages] = entries[0] as [string, Array<[string, string[]]>]
    if (!messages || messages.length === 0) {
      return null
    }

    const [id, fields] = messages[0]
    const fieldIndex = fields.findIndex((value, index) => index % 2 === 0 && value === 'payload')
    const payload = fieldIndex !== -1 ? fields[fieldIndex + 1] : undefined
    if (!payload) {
      return null
    }
    const task = JSON.parse(payload) as DriverTask
    task.driverMetadata = { id }
    return task
  }

  async acknowledge(task: DriverTask): Promise<void> {
    const id = task.driverMetadata?.id as string | undefined
    if (id) {
      await this.options.redis.xack(this.streamKey, this.groupName, id)
      await this.options.redis.xdel(this.streamKey, id)
    }
  }

  async fail(task: DriverTask, _error: unknown): Promise<void> {
    await this.acknowledge(task)
  }

  async stats(): Promise<TaskQueueStats> {
    const queued = await this.options.redis.xlen(this.streamKey)
    const scheduled = await this.options.redis.zcard(this.scheduledKey)
    const pending = (await this.options.redis.xpending(this.streamKey, this.groupName)) as unknown as { count: number }
    return {
      queued,
      scheduled,
      inFlight: pending.count,
    }
  }

  async shutdown(): Promise<void> {}

  private async releaseScheduled(now: number): Promise<void> {
    const entries = await this.options.redis.zrangebyscore(this.scheduledKey, 0, now, 'LIMIT', 0, 32)
    if (entries.length === 0) {
      return
    }

    const pipeline = this.options.redis.pipeline()
    for (const entry of entries) {
      pipeline.xadd(this.streamKey, '*', 'payload', entry)
      pipeline.zrem(this.scheduledKey, entry)
    }
    await pipeline.exec()
  }

  private async reclaimExpired(): Promise<void> {
    const result = await this.options.redis.xautoclaim(
      this.streamKey,
      this.groupName,
      this.consumerName,
      this.visibilityTimeout,
      '0-0',
      'COUNT',
      32,
    )

    const messages = result[1] as Array<[string, string[]]> | undefined
    if (!messages) {
      return
    }

    for (const [id] of messages) {
      await this.options.redis.xack(this.streamKey, this.groupName, id)
      await this.options.redis.xdel(this.streamKey, id)
    }
  }
}
