import { useCallback, useEffect, useMemo, useState } from 'react'

import { TaskQueueClient } from '../lib/task-queue-client'
import type { DemoJobState, EnqueueNotificationInput, QueueStats } from '../types/task-queue'

export function TaskQueueDemo() {
  const client = useMemo(() => new TaskQueueClient(), [])
  const [form, setForm] = useState<EnqueueNotificationInput>({
    recipient: 'demo@example.com',
    message: 'Hello from task queue!',
    channel: 'email',
    attemptsBeforeSuccess: 1,
  })
  const [jobs, setJobs] = useState<DemoJobState[]>([])
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const [jobs, stats] = await Promise.all([client.listJobs(), client.getStats()])
    setJobs(jobs)
    setStats(stats)
  }, [client])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 2000)
    return () => clearInterval(timer)
  }, [refresh])

  const enqueue = useCallback(async () => {
    setLoading(true)
    try {
      await client.enqueue(form)
      await refresh()
    } finally {
      setLoading(false)
    }
  }, [client, form, refresh])

  return (
    <div style={{ padding: 20, border: '1px solid #eee', borderRadius: 8, marginTop: 24 }}>
      <h2>Task Queue Demo</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <label>
          <div>Recipient</div>
          <input value={form.recipient} onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))} />
        </label>
        <label>
          <div>Channel</div>
          <select
            value={form.channel ?? 'email'}
            onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as any }))}
          >
            <option value="email">email</option>
            <option value="sms">sms</option>
            <option value="push">push</option>
          </select>
        </label>
        <label style={{ gridColumn: '1 / -1' }}>
          <div>Message</div>
          <input value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
        </label>
        <label>
          <div>Delay Seconds</div>
          <input
            type="number"
            min={0}
            value={form.delaySeconds ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, delaySeconds: Number(e.target.value) || 0 }))}
          />
        </label>
        <label>
          <div>Attempts Before Success</div>
          <input
            type="number"
            min={0}
            max={3}
            value={form.attemptsBeforeSuccess ?? 0}
            onChange={(e) =>
              setForm((f) => ({ ...f, attemptsBeforeSuccess: Math.max(0, Number(e.target.value) || 0) }))
            }
          />
        </label>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={enqueue} disabled={loading}>
          {loading ? 'Enqueuing...' : 'Enqueue Job'}
        </button>
        <button onClick={() => void refresh()}>Refresh</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Stats:</strong>{' '}
        {stats ? (
          <span>
            queued={stats.queued} in_flight={stats.inFlight} scheduled={stats.scheduled} tracked_jobs=
            {stats.trackedJobs}
          </span>
        ) : (
          '—'
        )}
      </div>

      <h3 style={{ marginTop: 16 }}>Jobs</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {jobs.length === 0 ? (
          <div>No jobs</div>
        ) : (
          jobs.map((job) => (
            <details key={job.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
              <summary>
                {job.id} — {job.status} — attempts={job.attempts}
              </summary>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(job, null, 2)}</pre>
            </details>
          ))
        )}
      </div>
    </div>
  )
}
