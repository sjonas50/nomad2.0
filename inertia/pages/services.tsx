import { Head } from '@inertiajs/react'
import { useState, useCallback } from 'react'
import AppLayout from '~/layouts/app_layout'
import { apiFetch } from '~/lib/fetch'

interface Container {
  id: string
  name: string
  image: string
  state: string
  status: string
  ports: Array<{ private: number; public?: number }>
}

interface CatalogModel {
  name: string
  category: string
  description: string
  sizeGb: number
  minRamGb: number
}

interface ModelRoleAssignment {
  roleName: string
  modelName: string
}

interface Props {
  containers: Container[]
  dockerAvailable: boolean
  ollamaAvailable: boolean
  installedModels: string[]
  modelCatalog: CatalogModel[]
  modelRoles: ModelRoleAssignment[]
}

const STATE_COLORS: Record<string, string> = {
  running: 'bg-green-600',
  exited: 'bg-red-600',
  paused: 'bg-yellow-600',
  created: 'bg-zinc-600',
  restarting: 'bg-blue-600',
}

const ROLE_LABELS: Record<string, string> = {
  generator: 'Chat (Generator)',
  embedder: 'Embedding',
  classifier: 'Intent Classifier',
  rewriter: 'Query Rewriter',
}

const CATEGORY_COLORS: Record<string, string> = {
  Chat: 'text-blue-400',
  Reasoning: 'text-purple-400',
  Embedding: 'text-green-400',
  Code: 'text-amber-400',
}

export default function Services({
  containers: initial,
  dockerAvailable,
  ollamaAvailable,
  installedModels: initialModels = [],
  modelCatalog = [],
  modelRoles: initialRoles = [],
}: Props) {
  const [containers, setContainers] = useState(initial)
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [installedModels, setInstalledModels] = useState<string[]>(initialModels)
  const [modelRoles, setModelRoles] = useState<ModelRoleAssignment[]>(initialRoles)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState('')
  const [tab, setTab] = useState<'containers' | 'models'>('containers')
  const [modelFilter, setModelFilter] = useState<string>('all')

  const action = async (id: string, act: string) => {
    setLoading((prev) => ({ ...prev, [id]: true }))
    try {
      await apiFetch(`/api/services/${id}/${act}`, { method: 'POST' })
      const res = await fetch(window.location.href, { headers: { Accept: 'application/json' } })
      if (res.ok) {
        const data = await res.json()
        if (data.props?.containers) setContainers(data.props.containers)
      }
    } catch { /* */ }
    setLoading((prev) => ({ ...prev, [id]: false }))
  }

  const viewLogs = async (id: string) => {
    try {
      const res = await fetch(`/api/services/${id}/logs?tail=50`)
      if (res.ok) {
        const data = await res.json()
        setLogs((prev) => ({ ...prev, [id]: prev[id] ? '' : data.logs }))
      }
    } catch { /* */ }
  }

  const refreshModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models')
      if (res.ok) {
        const data = await res.json()
        setInstalledModels(data.models.map((m: { name: string }) => m.name))
      }
    } catch { /* */ }
  }, [])

  const pullModel = async (modelName: string) => {
    setPulling(modelName)
    setPullProgress('Starting download...')
    try {
      const res = await apiFetch('/api/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line)
            if (data.done) {
              setPullProgress('')
            } else if (data.status) {
              const pct = data.completed && data.total
                ? ` (${Math.round((data.completed / data.total) * 100)}%)`
                : ''
              setPullProgress(`${data.status}${pct}`)
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* */ }
    setPulling(null)
    refreshModels()
  }

  const deleteModel = async (modelName: string) => {
    if (!confirm(`Remove ${modelName}? This will free disk space but the model will need to be re-downloaded to use again.`)) return
    try {
      await apiFetch(`/api/models/${encodeURIComponent(modelName)}`, { method: 'DELETE' })
      refreshModels()
    } catch { /* */ }
  }

  const assignRole = async (roleName: string, modelName: string) => {
    try {
      await apiFetch('/api/models/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleName, modelName }),
      })
      setModelRoles((prev) => {
        const filtered = prev.filter((r) => r.roleName !== roleName)
        return [...filtered, { roleName, modelName }]
      })
    } catch { /* */ }
  }

  const isInstalled = (name: string) => installedModels.some((m) => m.startsWith(name.split(':')[0]) && m.includes(name.includes(':') ? name.split(':')[1] : ''))
  const categories = ['all', ...new Set(modelCatalog.map((m) => m.category))]
  const filteredCatalog = modelFilter === 'all' ? modelCatalog : modelCatalog.filter((m) => m.category === modelFilter)

  return (
    <AppLayout>
      <Head title="Services" />
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Services & Models</h1>
          <div className="flex gap-1 bg-surface-800 rounded-lg p-1 border border-zinc-800">
            <button
              onClick={() => setTab('containers')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === 'containers' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              Containers
            </button>
            <button
              onClick={() => setTab('models')}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === 'models' ? 'bg-brand-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              AI Models
            </button>
          </div>
        </div>

        {tab === 'containers' && (
          <>
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
                  <div key={c.id} className="bg-surface-800 rounded-lg border border-zinc-800 p-4">
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
                              {c.ports.filter((p) => p.public).map((p) => `${p.public}:${p.private}`).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {c.state !== 'running' && (
                          <button onClick={() => action(c.id, 'start')} disabled={loading[c.id]} className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded disabled:opacity-50">Start</button>
                        )}
                        {c.state === 'running' && (
                          <>
                            <button onClick={() => action(c.id, 'stop')} disabled={loading[c.id]} className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded disabled:opacity-50">Stop</button>
                            <button onClick={() => action(c.id, 'restart')} disabled={loading[c.id]} className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded disabled:opacity-50">Restart</button>
                          </>
                        )}
                        <button onClick={() => viewLogs(c.id)} className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded">Logs</button>
                      </div>
                    </div>
                    {logs[c.id] && (
                      <pre className="mt-3 p-3 bg-black rounded text-xs text-zinc-300 overflow-x-auto max-h-60 overflow-y-auto">{logs[c.id]}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'models' && (
          <div className="space-y-6">
            {/* Ollama status */}
            {!ollamaAvailable && (
              <div className="p-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-yellow-300 text-sm">
                Ollama is not running. Start it to manage AI models.
              </div>
            )}

            {/* Model role assignments */}
            {installedModels.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-400 uppercase mb-3">Active Assignments</h2>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(ROLE_LABELS).map(([role, label]) => {
                    const assigned = modelRoles.find((r) => r.roleName === role)
                    const chatModels = installedModels.filter((m) =>
                      role === 'embedder' ? m.includes('embed') : !m.includes('embed')
                    )
                    return (
                      <div key={role} className="bg-surface-800 rounded-lg border border-zinc-800 p-3">
                        <div className="text-xs text-zinc-500 mb-1.5">{label}</div>
                        <select
                          value={assigned?.modelName || ''}
                          onChange={(e) => { if (e.target.value) assignRole(role, e.target.value) }}
                          className="w-full bg-surface-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
                        >
                          <option value="">Select model...</option>
                          {chatModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Installed models */}
            {installedModels.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-400 uppercase mb-3">
                  Installed ({installedModels.length})
                </h2>
                <div className="flex flex-wrap gap-2">
                  {installedModels.map((m) => (
                    <div key={m} className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
                      <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                      <span className="text-sm text-green-400 font-mono">{m}</span>
                      <button
                        onClick={() => deleteModel(m)}
                        className="text-zinc-600 hover:text-red-400 transition-colors ml-1"
                        title="Remove model"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pull progress */}
            {pulling && (
              <div className="bg-brand-500/10 border border-brand-500/20 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <svg className="h-4 w-4 animate-spin text-brand-400 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <div className="flex-1">
                    <div className="text-sm text-white font-medium">Installing {pulling}</div>
                    <div className="text-xs text-zinc-400 mt-0.5">{pullProgress}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Model catalog */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase">Available Models</h2>
                <div className="flex gap-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setModelFilter(cat)}
                      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                        modelFilter === cat
                          ? 'bg-zinc-700 text-white'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {cat === 'all' ? 'All' : cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {filteredCatalog.map((model) => {
                  const installed = isInstalled(model.name)
                  const isPulling = pulling === model.name
                  return (
                    <div
                      key={model.name}
                      className={`flex items-center gap-4 rounded-lg border p-3 transition-colors ${
                        installed
                          ? 'bg-green-500/5 border-green-500/15'
                          : 'bg-surface-800 border-zinc-800'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white font-mono">{model.name}</span>
                          <span className={`text-xs ${CATEGORY_COLORS[model.category] || 'text-zinc-500'}`}>
                            {model.category}
                          </span>
                          {installed && (
                            <span className="text-xs text-green-400 font-medium">Installed</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {model.description} &middot; {model.sizeGb} GB &middot; Min {model.minRamGb} GB RAM
                        </div>
                      </div>
                      {!installed && (
                        <button
                          onClick={() => pullModel(model.name)}
                          disabled={!!pulling}
                          className="shrink-0 px-4 py-1.5 text-xs bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {isPulling ? 'Installing...' : 'Install'}
                        </button>
                      )}
                      {installed && (
                        <button
                          onClick={() => deleteModel(model.name)}
                          className="shrink-0 px-4 py-1.5 text-xs bg-zinc-700 text-zinc-300 rounded-lg font-medium hover:bg-zinc-600 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
