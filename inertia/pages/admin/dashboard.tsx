import { Head } from '@inertiajs/react'
import { useState } from 'react'
import AppLayout from '~/layouts/app_layout'

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

interface Props {
  health: SystemHealth
  users: UserItem[]
  recentLogs: LogItem[]
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

export default function AdminDashboard({ health, users: initialUsers, recentLogs }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [tab, setTab] = useState<'health' | 'users' | 'logs' | 'backups'>('health')
  const [backups, setBackups] = useState<Array<{ filename: string; sizeBytes: number; type: string; createdAt: string }>>([])
  const [backupLoading, setBackupLoading] = useState(false)

  const updateRole = async (userId: number, role: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
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
      await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
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
      await fetch('/api/admin/backup', {
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
          {(['health', 'users', 'logs', 'backups'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t === 'backups') loadBackups() }}
              className={`pb-2 text-sm capitalize ${tab === t ? 'text-white border-b-2 border-blue-500' : 'text-zinc-400'}`}
            >
              {t}
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
              {health.services.map((s) => (
                <div key={s.name} className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[s.status]}`} />
                      <span className="text-white font-medium capitalize">{s.name}</span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {s.latencyMs !== undefined && `${s.latencyMs}ms`}
                    </div>
                  </div>
                  {s.message && <div className="text-xs text-zinc-500 mt-1">{s.message}</div>}
                </div>
              ))}
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
          <div className="space-y-2">
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
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm disabled:opacity-50"
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
