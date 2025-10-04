import { describe, expect, it } from 'vitest'

import { TaskProcessor } from '../src/task-processor.decorator'
import { TaskQueue } from '../src/task-queue'

describe('TaskProcessor decorator', () => {
  it('auto-registers handlers on the default queue property', async () => {
    class DemoWorker {
      public queue: TaskQueue
      public calls: Array<{ payload: unknown }> = []

      constructor() {
        this.queue = new TaskQueue({
          start: false,
          name: 'demo',
        })
      }

      @TaskProcessor('demo-task')
      async handle(payload: unknown): Promise<void> {
        this.calls.push({ payload })
      }
    }

    const worker = new DemoWorker()
    await worker.onModuleInit?.()
    await worker.queue.start({ pollIntervalMs: 1 })

    await expect(worker.queue.enqueue({ name: 'demo-task', payload: 'ping' })).resolves.toMatchObject({
      name: 'demo-task',
    })

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(worker.calls).toHaveLength(1)
    expect(worker.calls[0]?.payload).toBe('ping')

    await worker.queue.stop()
  })

  it('supports configuring alternative queue properties', async () => {
    class MultiQueueWorker {
      public primaryQueue: TaskQueue
      public secondaryQueue: TaskQueue

      constructor() {
        this.primaryQueue = new TaskQueue({ start: false, name: 'primary' })
        this.secondaryQueue = new TaskQueue({ start: false, name: 'secondary' })
      }

      @TaskProcessor('primary-task', { queueProperty: 'primaryQueue' })
      async onPrimary(payload: unknown): Promise<void> {
        void payload
      }

      @TaskProcessor({ name: 'secondary-task', queueProperty: 'secondaryQueue' })
      async onSecondary(payload: unknown): Promise<void> {
        void payload
      }
    }

    const worker = new MultiQueueWorker()
    await worker.onModuleInit?.()

    await expect(worker.primaryQueue.enqueue({ name: 'primary-task', payload: null })).resolves.toMatchObject({
      name: 'primary-task',
    })

    await expect(worker.secondaryQueue.enqueue({ name: 'secondary-task', payload: null })).resolves.toMatchObject({
      name: 'secondary-task',
    })

    await expect(worker.primaryQueue.enqueue({ name: 'secondary-task', payload: null })).rejects.toThrow(
      'Handler for task "secondary-task" is not registered',
    )

    await worker.primaryQueue.stop()
    await worker.secondaryQueue.stop()
  })
})
