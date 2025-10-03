export type Channel = 'email' | 'sms' | 'push'

export interface EnqueueNotificationInput {
  recipient: string
  message: string
  channel?: Channel
  delaySeconds?: number
  attemptsBeforeSuccess?: number
  priority?: number
  metadata?: Record<string, string | number | boolean>
}

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

export interface EnqueueResponse extends DemoJobState {
  jobId: string
}

export interface QueueStats {
  queued: number
  inFlight: number
  scheduled: number
  trackedJobs: number
}
