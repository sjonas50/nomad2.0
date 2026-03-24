import { Head } from '@inertiajs/react'
import { useState, useCallback } from 'react'
import AppLayout from '~/layouts/app_layout'
import { apiFetch } from '~/lib/fetch'

interface ServiceHealth {
  name: string
  status: 'up' | 'down' | 'degraded'
  latencyMs?: number
  message?: string
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  services: ServiceHealth[]
  capabilities: Record<string, boolean>
}

interface UserItem {
  id: number
  fullName: string
  email: string
  role: string
  createdAt: string
}

interface LogItem {
  id: number
  userId: number | null
  action: string
  resourceType: string | null
  resourceId: string | null
  ipAddress: string | null
  createdAt: string
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
  health: SystemHealth
  users: UserItem[]
  recentLogs: LogItem[]
  ollamaAvailable: boolean
  installedModels: string[]
  modelCatalog: CatalogModel[]
  modelRoles: ModelRoleAssignment[]
}

const STATUS_COLORS: Record<string, string> = {
  up: 'bg-green-600',
  down: 'bg-red-600',
  degraded: 'bg-yellow-600',
}

const OVERALL_COLORS: Record<string, string> = {
  healthy: 'text-green-400',
  degraded: 'text-yellow-400',
  unhealthy: 'text-red-400',
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

export default function AdminDashboard({
  health,
  users: initialUsers,
  recentLogs,
  ollamaAvailable,
  installedModels: initialModels = [],
  modelCatalog = [],
  modelRoles: initialRoles = [],
}: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [tab, setTab] = useState<'health' | 'users' | 'services' | 'models' | 'logs' | 'backups'>('health')
  const [backups, setBackups] = useState<Array<{ filename: string; sizeBytes: number; type: string; createdAt: string }>>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState({ fullName: '', email: '', password: '', role: 'viewer' })
  const [addUserError, setAddUserError] = useState('')
  const [addUserLoading, setAddUserLoading] = useState(false)

  // Optional service toggle state
  const [togglingService, setTogglingService] = useState<string | null>(null)

  const OPTIONAL_SERVICES = [
    {
      id: 'falkordb',
      label: 'FalkorDB (Knowledge Graph)',
      description: 'Entity relationship extraction and graph-based retrieval. Improves AI answers by understanding connections between concepts. Recommended for 16GB+ RAM.',
      ram: '~2 GB',
    },
    {
      id: 'sidecar',
      label: 'Python Sidecar',
      description: 'Enables ZIM file reading (Wikipedia, etc.), entity extraction for the knowledge graph, and voice transcription via whisper.cpp.',
      ram: '~500 MB',
    },
    {
      id: 'opentakserver',
      label: 'TAK Server (ATAK/iTAK)',
      description: 'CoT (Cursor on Target) bridge for ATAK and iTAK interoperability. Enables position tracking and GeoChat with tactical radios.',
      ram: '~300 MB',
    },
  ]

  const getServiceStatus = (serviceId: string): 'up' | 'down' | 'unknown' => {
    const nameMap: Record<string, string> = {
      falkordb: 'falkordb',
      sidecar: 'sidecar',
      opentakserver: 'opentakserver',
    }
    const svc = health.services.find((s) => s.name === nameMap[serviceId])
    if (!svc) return 'unknown'
    return svc.status === 'up' ? 'up' : 'down'
  }

  const toggleService = async (serviceId: string, enable: boolean) => {
    setTogglingService(serviceId)
    try {
      await apiFetch('/api/onboarding/toggle-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: serviceId, enable }),
      })
      // Reload page to refresh health status
      window.location.reload()
    } catch { /* */ }
    setTogglingService(null)
  }

  // Model management state
  const [installedModels, setInstalledModels] = useState<string[]>(initialModels)
  const [modelRoles, setModelRoles] = useState<ModelRoleAssignment[]>(initialRoles)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState('')
  const [modelFilter, setModelFilter] = useState<string>('all')

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

  const createUser = async () => {
    setAddUserError('')
    if (!newUser.fullName.trim() || !newUser.email.trim() || newUser.password.length < 8) {
      setAddUserError('All fields required. Password must be at least 8 characters.')
      return
    }
    setAddUserLoading(true)
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      if (res.ok) {
        const user = await res.json()
        setUsers((prev) => [user, ...prev])
        setNewUser({ fullName: '', email: '', password: '', role: 'viewer' })
        setShowAddUser(false)
      } else {
        const body = await res.json().catch(() => null)
        setAddUserError(body?.error || `Failed (${res.status})`)
      }
    } catch {
      setAddUserError('Network error')
    }
    setAddUserLoading(false)
  }

  const updateRole = async (userId: number, role: string) => {
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
      }
    } catch { /* ignore */ }
  }

  const deleteUser = async (userId: number) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } catch { /* ignore */ }
  }

  const loadBackups = async () => {
    try {
      const res = await fetch('/api/admin/backups')
      if (res.ok) setBackups(await res.json())
    } catch { /* ignore */ }
  }

  const createBackup = async (type: string) => {
    setBackupLoading(true)
    try {
      await apiFetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      await loadBackups()
    } catch { /* ignore */ }
    setBackupLoading(false)
  }

  return (
    <AppLayout>
      <Head title="Admin" />
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Admin Dashboard</h1>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-zinc-700">
          {(['health', 'users', 'services', 'models', 'logs', 'backups'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t === 'backups') loadBackups() }}
              className={`pb-2 text-sm capitalize ${tab === t ? 'text-white border-b-2 border-brand-500' : 'text-zinc-400'}`}
            >
              {t === 'models' ? 'AI Models' : t}
            </button>
          ))}
        </div>

        {/* Health */}
        {tab === 'health' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-zinc-400">Overall:</span>
              <span className={`text-lg font-bold capitalize ${OVERALL_COLORS[health.overall]}`}>
                {health.overall}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {health.services.map((s) => {
                const optionalNames = ['falkordb', 'sidecar', 'opentakserver']
                const isOptionalDisabled = s.status === 'down' && optionalNames.includes(s.name)
                const dotColor = isOptionalDisabled ? 'bg-zinc-600' : STATUS_COLORS[s.status]
                return (
                  <div key={s.name} className={`p-3 rounded-lg border ${isOptionalDisabled ? 'bg-zinc-800/50 border-zinc-800' : 'bg-zinc-800 border-zinc-700'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                        <span className={`font-medium capitalize ${isOptionalDisabled ? 'text-zinc-500' : 'text-white'}`}>{s.name}</span>
                        {isOptionalDisabled && <span className="text-[10px] text-zinc-600 uppercase">optional</span>}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {s.latencyMs !== undefined && !isOptionalDisabled && `${s.latencyMs}ms`}
                      </div>
                    </div>
                    {s.message && !isOptionalDisabled && <div className="text-xs text-zinc-500 mt-1">{s.message}</div>}
                  </div>
                )
              })}
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Capabilities</h3>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(health.capabilities).map(([key, enabled]) => (
                  <span
                    key={key}
                    className={`px-2 py-1 text-xs rounded ${enabled ? 'bg-green-900/30 text-green-300' : 'bg-zinc-800 text-zinc-500'}`}
                  >
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Users */}
        {tab === 'users' && (
          <div className="space-y-3">
            {/* Add User button / form */}
            {!showAddUser ? (
              <button
                onClick={() => setShowAddUser(true)}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                + Add User
              </button>
            ) : (
              <div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 space-y-3">
                <h3 className="text-sm font-semibold text-white">New User</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newUser.fullName}
                    onChange={(e) => setNewUser((p) => ({ ...p, fullName: e.target.value }))}
                    className="px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newUser.email}
                    onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                    className="px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Password (min 8 chars)"
                    value={newUser.password}
                    onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                    className="px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                  />
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
                    className="px-3 py-2 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:border-brand-500 focus:outline-none"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {addUserError && <p className="text-sm text-red-400">{addUserError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={createUser}
                    disabled={addUserLoading}
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    {addUserLoading ? 'Creating...' : 'Create User'}
                  </button>
                  <button
                    onClick={() => { setShowAddUser(false); setAddUserError('') }}
                    className="px-4 py-2 text-zinc-400 hover:text-white text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* User list */}
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                <div>
                  <span className="text-white">{u.fullName}</span>
                  <span className="text-xs text-zinc-500 ml-2">{u.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    className="px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded text-white"
                  >
                    <option value="viewer">viewer</option>
                    <option value="operator">operator</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    onClick={() => deleteUser(u.id)}
                    className="px-2 py-1 text-xs text-zinc-400 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Services */}
        {tab === 'services' && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Enable or disable optional services. Core services (MySQL, Redis, Ollama, Qdrant) are always running.
            </p>

            {OPTIONAL_SERVICES.map((svc) => {
              const status = getServiceStatus(svc.id)
              const isRunning = status === 'up'
              const isToggling = togglingService === svc.id

              return (
                <div
                  key={svc.id}
                  className={`p-4 rounded-xl border transition-colors ${
                    isRunning
                      ? 'bg-green-500/5 border-green-500/20'
                      : 'bg-zinc-800 border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isRunning ? 'bg-green-500' : 'bg-zinc-600'}`} />
                        <span className="text-white font-medium">{svc.label}</span>
                        <span className={`text-xs ${isRunning ? 'text-green-400' : 'text-zinc-500'}`}>
                          {isRunning ? 'Running' : 'Stopped'}
                        </span>
                      </div>
                      <p className="text-sm text-zinc-400 mt-1.5 ml-4">{svc.description}</p>
                      <p className="text-xs text-zinc-600 mt-1 ml-4">Memory usage: {svc.ram}</p>
                    </div>
                    <button
                      onClick={() => toggleService(svc.id, !isRunning)}
                      disabled={isToggling}
                      className={`shrink-0 ml-4 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                        isRunning
                          ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                          : 'bg-brand-500 text-white hover:bg-brand-600'
                      }`}
                    >
                      {isToggling ? 'Working...' : isRunning ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* AI Models */}
        {tab === 'models' && (
          <div className="space-y-6">
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
                      <div key={role} className="bg-zinc-800 rounded-lg border border-zinc-700 p-3">
                        <div className="text-xs text-zinc-500 mb-1.5">{label}</div>
                        <select
                          value={assigned?.modelName || ''}
                          onChange={(e) => { if (e.target.value) assignRole(role, e.target.value) }}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500"
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
                          : 'bg-zinc-800 border-zinc-700'
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

        {/* Audit Logs */}
        {tab === 'logs' && (
          <div className="space-y-1">
            {recentLogs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">No audit logs yet.</div>
            ) : (
              recentLogs.map((l) => (
                <div key={l.id} className="flex items-center gap-3 p-2 text-sm text-zinc-300 bg-zinc-800/50 rounded">
                  <span className="text-xs text-zinc-500 w-36 shrink-0">
                    {l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}
                  </span>
                  <span className="px-1.5 py-0.5 text-xs rounded bg-zinc-700 text-zinc-300">{l.action}</span>
                  {l.resourceType && <span className="text-xs text-zinc-500">{l.resourceType}</span>}
                  {l.resourceId && <span className="text-xs text-zinc-600">#{l.resourceId}</span>}
                  {l.ipAddress && <span className="text-xs text-zinc-600 ml-auto">{l.ipAddress}</span>}
                </div>
              ))
            )}
          </div>
        )}

        {/* Backups */}
        {tab === 'backups' && (
          <div>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => createBackup('mysql')}
                disabled={backupLoading}
                className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded text-sm disabled:opacity-50"
              >
                {backupLoading ? 'Creating...' : 'Backup MySQL'}
              </button>
              <button
                onClick={() => createBackup('qdrant')}
                disabled={backupLoading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm disabled:opacity-50"
              >
                Backup Qdrant
              </button>
            </div>

            <div className="space-y-2">
              {backups.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">No backups found.</div>
              ) : (
                backups.map((b) => (
                  <div key={b.filename} className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                    <div>
                      <span className="text-white text-sm">{b.filename}</span>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {(b.sizeBytes / 1024 / 1024).toFixed(1)} MB &middot; {b.type} &middot; {new Date(b.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
