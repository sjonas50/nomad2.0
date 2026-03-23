import { Head } from '@inertiajs/react'
import { useState } from 'react'
import AppLayout from '~/layouts/app_layout'

interface Container {
  id: string
  name: string
  image: string
  state: string
  status: string
  ports: Array<{ private: number; public?: number }>
}

interface Props {
  containers: Container[]
  dockerAvailable: boolean
}

const STATE_COLORS: Record<string, string> = {
  running: 'bg-green-600',
  exited: 'bg-red-600',
  paused: 'bg-yellow-600',
  created: 'bg-zinc-600',
  restarting: 'bg-blue-600',
}

export default function Services({ containers: initial, dockerAvailable }: Props) {
  const [containers, setContainers] = useState(initial)
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [logs, setLogs] = useState<Record<string, string>>({})

  const action = async (id: string, act: string) => {
    setLoading((prev) => ({ ...prev, [id]: true }))
    try {
      await fetch(`/api/services/${id}/${act}`, { method: 'POST' })
      // Refresh page after action
      const res = await fetch(window.location.href, { headers: { Accept: 'application/json' } })
      if (res.ok) {
        const data = await res.json()
        if (data.props?.containers) setContainers(data.props.containers)
      }
    } catch {
      // ignore
    }
    setLoading((prev) => ({ ...prev, [id]: false }))
  }

  const viewLogs = async (id: string) => {
    try {
      const res = await fetch(`/api/services/${id}/logs?tail=50`)
      if (res.ok) {
        const data = await res.json()
        setLogs((prev) => ({ ...prev, [id]: prev[id] ? '' : data.logs }))
      }
    } catch {
      // ignore
    }
  }

  return (
    <AppLayout>
      <Head title="Services" />
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Docker Services</h1>

        {!dockerAvailable ? (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-300">
            Docker is not available. Make sure Docker is running on this machine.
          </div>
        ) : containers.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <p>No containers found. Run <code>docker compose up -d</code> to start services.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {containers.map((c) => (
              <div key={c.id} className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{c.name}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full text-white ${STATE_COLORS[c.state] || 'bg-zinc-600'}`}>
                        {c.state}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1 flex gap-3">
                      <span>{c.image}</span>
                      <span>{c.status}</span>
                      {c.ports.length > 0 && (
                        <span>
                          {c.ports
                            .filter((p) => p.public)
                            .map((p) => `${p.public}:${p.private}`)
                            .join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {c.state !== 'running' && (
                      <button
                        onClick={() => action(c.id, 'start')}
                        disabled={loading[c.id]}
                        className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50"
                      >
                        Start
                      </button>
                    )}
                    {c.state === 'running' && (
                      <>
                        <button
                          onClick={() => action(c.id, 'stop')}
                          disabled={loading[c.id]}
                          className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded disabled:opacity-50"
                        >
                          Stop
                        </button>
                        <button
                          onClick={() => action(c.id, 'restart')}
                          disabled={loading[c.id]}
                          className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded disabled:opacity-50"
                        >
                          Restart
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => viewLogs(c.id)}
                      className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded"
                    >
                      Logs
                    </button>
                  </div>
                </div>
                {logs[c.id] && (
                  <pre className="mt-3 p-3 bg-black rounded text-xs text-zinc-300 overflow-x-auto max-h-60 overflow-y-auto">
                    {logs[c.id]}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
