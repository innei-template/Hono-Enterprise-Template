import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { WebSocketClient } from '../lib/ws-client'
import type { ServerMessage } from '../types/ws'
import { TaskQueueDemo } from './TaskQueueDemo'

export function App() {
  const clientRef = useRef<WebSocketClient | null>(null)
  const [connected, setConnected] = useState(false)
  const [channelInput, setChannelInput] = useState('demo')
  const [payloadInput, setPayloadInput] = useState('Hello from web!')
  const [messages, setMessages] = useState<ServerMessage[]>([])

  const client = useMemo(() => new WebSocketClient(), [])

  useEffect(() => {
    clientRef.current = client
    const unsub = client.subscribe((msg) => setMessages((prev) => [msg, ...prev].slice(0, 100)))
    return () => {
      unsub()
    }
  }, [client])

  const connect = useCallback(async () => {
    if (connected) return
    await client.connect()
    setConnected(true)
  }, [client, connected])

  const disconnect = useCallback(async () => {
    if (!connected) return
    await client.disconnect()
    setConnected(false)
  }, [client, connected])

  const subscribe = useCallback(() => {
    client.send({ type: 'subscribe', channels: [channelInput] })
  }, [client, channelInput])

  const unsubscribe = useCallback(() => {
    client.send({ type: 'unsubscribe', channels: [channelInput] })
  }, [client, channelInput])

  const publishViaWs = useCallback(() => {
    client.send({ type: 'publish', channel: channelInput, payload: payloadInput })
  }, [client, channelInput, payloadInput])

  const publishViaHttp = useCallback(async () => {
    await fetch(`/api/websocket/channels/${encodeURIComponent(channelInput)}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: payloadInput }),
    })
  }, [channelInput, payloadInput])

  const subscribeTaskChannel = useCallback(() => {
    const ch = `queue:${channelInput || 'email'}`
    client.send({ type: 'subscribe', channels: [ch] })
  }, [client, channelInput])

  return (
    <div style={{ padding: 20, fontFamily: 'ui-sans-serif, system-ui, Arial' }}>
      <h2>WebSocket Demo</h2>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button onClick={connect} disabled={connected}>
          Connect
        </button>
        <button onClick={disconnect} disabled={!connected}>
          Disconnect
        </button>
        <span style={{ marginLeft: 8 }}>Status: {connected ? 'Connected' : 'Disconnected'}</span>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <label>
          <div>Channel</div>
          <input value={channelInput} onChange={(e) => setChannelInput(e.target.value)} />
        </label>
        <label>
          <div>Payload</div>
          <input value={payloadInput} onChange={(e) => setPayloadInput(e.target.value)} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={subscribe} disabled={!connected}>
          Subscribe
        </button>
        <button onClick={unsubscribe} disabled={!connected}>
          Unsubscribe
        </button>
        <button onClick={publishViaWs} disabled={!connected}>
          Publish via WS
        </button>
        <button onClick={publishViaHttp}>Publish via HTTP</button>
        <button onClick={subscribeTaskChannel} disabled={!connected}>
          Subscribe queue:{channelInput || 'email'}
        </button>
      </div>

      <h3 style={{ marginTop: 20 }}>Messages</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {messages.length === 0 ? (
          <div>No messages</div>
        ) : (
          messages.map((m, idx) => (
            <div key={idx} style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}>
              <code>{JSON.stringify(m)}</code>
            </div>
          ))
        )}
      </div>

      <TaskQueueDemo />
    </div>
  )
}
