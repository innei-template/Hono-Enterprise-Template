import type { DemoJobState, EnqueueNotificationInput, EnqueueResponse, QueueStats } from '../types/task-queue'

function unwrap<T>(body: unknown): T {
  if (!body || typeof body !== 'object') return body as T
  if ('data' in (body as any)) return (body as any).data as T
  return body as T
}

export class TaskQueueClient {
  async enqueue(payload: EnqueueNotificationInput): Promise<EnqueueResponse> {
    const res = await fetch('/api/queue/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('Failed to enqueue job')
    return unwrap<EnqueueResponse>(await res.json())
  }

  async listJobs(): Promise<DemoJobState[]> {
    const res = await fetch('/api/queue/jobs')
    if (!res.ok) throw new Error('Failed to list jobs')
    return unwrap<DemoJobState[]>(await res.json())
  }

  async getJob(id: string): Promise<DemoJobState> {
    const res = await fetch(`/api/queue/jobs/${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error('Failed to get job')
    return unwrap<DemoJobState>(await res.json())
  }

  async getStats(): Promise<QueueStats> {
    const res = await fetch('/api/queue/stats')
    if (!res.ok) throw new Error('Failed to get queue stats')
    return unwrap<QueueStats>(await res.json())
  }
}
