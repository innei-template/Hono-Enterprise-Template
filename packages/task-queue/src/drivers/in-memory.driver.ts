import { setTimeout as sleep } from 'node:timers/promises'

import type { DriverTask, PollOptions, TaskQueueDriver, TaskQueueStats } from '../types'

interface Waiter {
  resolve: (task: DriverTask | null) => void
  signal?: AbortSignal
}

export interface InMemoryDriverOptions {
  name?: string
}

export class InMemoryQueueDriver implements TaskQueueDriver {
  private readonly ready: DriverTask[] = []
  private readonly scheduled = new Map<string, NodeJS.Timeout>()
  private readonly waiting: Waiter[] = []
  private readonly inflight = new Map<string, DriverTask>()
  private running = true

  constructor(public readonly options: InMemoryDriverOptions = {}) {}

  async enqueue<TPayload>(task: DriverTask<TPayload>): Promise<void> {
    if (!this.running) {
      throw new Error('Driver stopped')
    }

    if (task.runAt > Date.now()) {
      this.schedule(task)
      return
    }

    this.ready.push(task)
    this.notify()
  }

  async reschedule<TPayload>(task: DriverTask<TPayload>, runAt: number): Promise<void> {
    const updated: DriverTask<TPayload> = {
      ...task,
      runAt,
    }
    await this.enqueue(updated)
  }

  async poll(options: PollOptions): Promise<DriverTask | null> {
    if (!this.running) {
      return null
    }

    if (this.ready.length > 0) {
      const task = this.ready.shift()!
      this.inflight.set(task.id, task)
      return task
    }

    return await new Promise<DriverTask | null>((resolve) => {
      const waiter: Waiter = { resolve, signal: options.signal }

      const onAbort = () => {
        this.waiting.splice(this.waiting.indexOf(waiter), 1)
        resolve(null)
      }

      if (options.signal) {
        if (options.signal.aborted) {
          resolve(null)
          return
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
      }

      this.waiting.push(waiter)

      void sleep(options.timeoutMs).then(() => {
        const index = this.waiting.indexOf(waiter)
        if (index !== -1) {
          this.waiting.splice(index, 1)
          resolve(null)
        }
        options.signal?.removeEventListener('abort', onAbort)
      })
    })
  }

  async acknowledge(task: DriverTask): Promise<void> {
    this.inflight.delete(task.id)
  }

  async fail(task: DriverTask): Promise<void> {
    this.inflight.delete(task.id)
  }

  async stats(): Promise<TaskQueueStats> {
    return {
      queued: this.ready.length,
      scheduled: this.scheduled.size,
      inFlight: this.inflight.size,
    }
  }

  async shutdown(): Promise<void> {
    this.running = false
    for (const waiter of this.waiting.splice(0)) {
      waiter.resolve(null)
    }
    for (const timer of this.scheduled.values()) {
      clearTimeout(timer)
    }
    this.scheduled.clear()
    this.ready.length = 0
    this.inflight.clear()
  }

  private schedule(task: DriverTask): void {
    const delay = Math.max(0, task.runAt - Date.now())
    const timer = setTimeout(() => {
      this.scheduled.delete(task.id)
      this.ready.push(task)
      this.notify()
    }, delay)
    this.scheduled.set(task.id, timer)
  }

  private notify(): void {
    if (this.waiting.length > 0 && this.ready.length > 0) {
      const waiter = this.waiting.shift()!
      const task = this.ready.shift()!
      this.inflight.set(task.id, task)
      waiter.resolve(task)
    }
  }
}
