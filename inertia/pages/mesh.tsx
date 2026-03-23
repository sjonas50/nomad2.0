import { Head } from '@inertiajs/react'
import { useState } from 'react'
import AppLayout from '~/layouts/app_layout'

interface MeshMessageItem {
  id: number
  packetId: string
  fromNode: string
  toNode: string | null
  channel: string
  portNum: string
  content: string | null
  receivedAt: string | null
}

interface MeshNodeItem {
  id: number
  nodeId: string
  longName: string | null
  shortName: string | null
  hardwareModel: string | null
  batteryLevel: number | null
  snr: number | null
  isOnline: boolean
  lastHeardAt: string | null
  latitude: number | null
  longitude: number | null
}

interface Props {
  enabled: boolean
  messages: MeshMessageItem[]
  nodes: MeshNodeItem[]
  channels: string[]
}

export default function Mesh({ enabled, messages: initialMessages, nodes, channels }: Props) {
  const [messages, setMessages] = useState(initialMessages)
  const [activeChannel, setActiveChannel] = useState<string | null>(null)
  const [tab, setTab] = useState<'messages' | 'nodes'>('messages')
  const [summary, setSummary] = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)

  const filteredMessages = activeChannel
    ? messages.filter((m) => m.channel === activeChannel)
    : messages

  const refreshMessages = async () => {
    const params = new URLSearchParams({ limit: '50' })
    if (activeChannel) params.set('channel', activeChannel)
    try {
      const res = await fetch(`/api/mesh/messages?${params}`)
      if (res.ok) setMessages(await res.json())
    } catch { /* ignore */ }
  }

  const handleSummary = async () => {
    setLoadingSummary(true)
    try {
      const params = new URLSearchParams({ hours: '1' })
      if (activeChannel) params.set('channel', activeChannel)
      const res = await fetch(`/api/mesh/summary?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSummary(data.summary)
      }
    } catch { /* ignore */ }
    setLoadingSummary(false)
  }

  if (!enabled) {
    return (
      <AppLayout>
        <Head title="Mesh Network" />
        <div className="p-6 max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">Mesh Network</h1>
          <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-300">
            Meshtastic integration is not enabled. Set <code>MESH_ENABLED=true</code> in your environment to activate.
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <Head title="Mesh Network" />
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Mesh Network</h1>
          <div className="flex gap-2">
            <button
              onClick={refreshMessages}
              className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-white rounded"
            >
              Refresh
            </button>
            <button
              onClick={handleSummary}
              disabled={loadingSummary}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            >
              {loadingSummary ? 'Summarizing...' : 'AI Summary'}
            </button>
          </div>
        </div>

        {summary && (
          <div className="mb-4 p-4 bg-blue-900/30 border border-blue-700 rounded-lg text-blue-200">
            <div className="text-xs text-blue-400 mb-1">AI Summary</div>
            {summary}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-4 border-b border-zinc-700">
          <button
            onClick={() => setTab('messages')}
            className={`pb-2 text-sm ${tab === 'messages' ? 'text-white border-b-2 border-blue-500' : 'text-zinc-400'}`}
          >
            Messages ({messages.length})
          </button>
          <button
            onClick={() => setTab('nodes')}
            className={`pb-2 text-sm ${tab === 'nodes' ? 'text-white border-b-2 border-blue-500' : 'text-zinc-400'}`}
          >
            Nodes ({nodes.length})
          </button>
        </div>

        {tab === 'messages' && (
          <>
            {/* Channel filter */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setActiveChannel(null)}
                className={`px-3 py-1 text-xs rounded-full ${!activeChannel ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
              >
                All
              </button>
              {channels.map((ch) => (
                <button
                  key={ch}
                  onClick={() => setActiveChannel(ch)}
                  className={`px-3 py-1 text-xs rounded-full ${activeChannel === ch ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                >
                  {ch}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredMessages.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">No messages yet.</div>
              ) : (
                filteredMessages.map((m) => (
                  <div key={m.id} className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                    <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                      <span className="text-zinc-300 font-medium">{m.fromNode}</span>
                      {m.toNode && <span>→ {m.toNode}</span>}
                      <span className="px-1.5 py-0.5 rounded bg-zinc-700">{m.channel}</span>
                      <span>{m.portNum}</span>
                      {m.receivedAt && (
                        <span>{new Date(m.receivedAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                    {m.content && <div className="text-sm text-zinc-200">{m.content}</div>}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {tab === 'nodes' && (
          <div className="space-y-2">
            {nodes.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">No nodes discovered yet.</div>
            ) : (
              nodes.map((n) => (
                <div key={n.id} className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${n.isOnline ? 'bg-green-500' : 'bg-zinc-600'}`} />
                      <span className="text-white font-medium">
                        {n.longName || n.shortName || n.nodeId}
                      </span>
                      <span className="text-xs text-zinc-500">{n.nodeId}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      {n.hardwareModel && <span>{n.hardwareModel}</span>}
                      {n.batteryLevel !== null && <span>{n.batteryLevel.toFixed(0)}%</span>}
                      {n.snr !== null && <span>SNR: {n.snr.toFixed(1)}</span>}
                      {n.lastHeardAt && (
                        <span>{new Date(n.lastHeardAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
