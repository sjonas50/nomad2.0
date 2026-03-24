import AppLayout from '../layouts/app_layout'
import { useState } from 'react'

interface IncidentSummary {
  incident: {
    id: number; name: string; type: string; status: string
    iapPeriod: number; declaredAt: string; commander: string | null
  }
  functions: {
    total: number; nominal: number; degraded: number; failed: number
    items: Array<{ name: string; priority: number; status: string; rto: number | null }>
  }
  personnel: { total: number; available: number; deployed: number; injured: number; unaccounted: number }
  resources: { total: number; available: number; assigned: number }
}

interface FunctionItem { id: number; name: string; priority: number; status: string; recoveryTimeObjective: number | null }
interface PersonnelItem { id: number; userId: number; userName: string; status: string; locationText: string | null; assignment: string | null; checkedInAt: string; checkedInVia: string }
interface ActivityItem { id: number; activity: string; source: string; category: string; actorName: string; loggedAt: string; correctsId: number | null }
interface ResourceItem { id: number; name: string; type: string; quantity: number; status: string }
interface CommTree { id: number; name: string; type: string; treeData: unknown[] }

interface Props {
  summary: IncidentSummary
  functions: FunctionItem[]
  personnel: PersonnelItem[]
  activityLogs: ActivityItem[]
  resources: ResourceItem[]
  commTrees: CommTree[]
}

const STATUS_COLORS: Record<string, string> = {
  nominal: 'text-green-700 bg-green-100',
  degraded: 'text-yellow-700 bg-yellow-100',
  failed: 'text-red-700 bg-red-100',
}

const PERSONNEL_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  deployed: 'bg-blue-100 text-blue-800',
  injured: 'bg-red-100 text-red-800',
  unaccounted: 'bg-gray-100 text-gray-800',
}

type Tab = 'overview' | 'activity' | 'personnel' | 'resources' | 'comms'

export default function IncidentDetail({ summary, functions, personnel, activityLogs, resources, commTrees }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [newActivity, setNewActivity] = useState('')
  const [activityCategory, setActivityCategory] = useState('observation')

  const logActivity = async () => {
    if (!newActivity.trim()) return
    await fetch(`/api/incidents/${summary.incident.id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: newActivity, category: activityCategory }),
    })
    window.location.reload()
  }

  const checkIn = async (status: string) => {
    await fetch(`/api/incidents/${summary.incident.id}/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    window.location.reload()
  }

  const updateStatus = async (status: string) => {
    await fetch(`/api/incidents/${summary.incident.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    window.location.reload()
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'activity', label: `Activity (${activityLogs.length})` },
    { key: 'personnel', label: `Personnel (${personnel.length})` },
    { key: 'resources', label: `Resources (${resources.length})` },
    { key: 'comms', label: `Comms (${commTrees.length})` },
  ]

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <a href="/incidents" className="text-sm text-blue-600 hover:underline">← All Incidents</a>
            <h1 className="text-2xl font-bold mt-1">{summary.incident.name}</h1>
            <div className="text-sm text-gray-500">
              {summary.incident.type.replace(/_/g, ' ')} · Period {summary.incident.iapPeriod} · Commander: {summary.incident.commander || 'Unassigned'}
            </div>
          </div>
          <div className="flex gap-2">
            {summary.incident.status === 'declared' && (
              <button onClick={() => updateStatus('active')} className="px-3 py-1 bg-red-600 text-white rounded text-sm">Activate</button>
            )}
            {summary.incident.status === 'active' && (
              <button onClick={() => updateStatus('contained')} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Mark Contained</button>
            )}
            {(summary.incident.status === 'contained' || summary.incident.status === 'active') && (
              <button onClick={() => updateStatus('closed')} className="px-3 py-1 bg-gray-600 text-white rounded text-sm">Close</button>
            )}
          </div>
        </div>

        {/* Quick check-in bar */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
          <span className="text-sm font-medium">Quick Check-In:</span>
          {['available', 'deployed'].map((s) => (
            <button key={s} onClick={() => checkIn(s)} className="px-3 py-1 bg-white border rounded text-sm hover:bg-blue-50 capitalize">
              {s}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b flex gap-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-2 text-sm font-medium ${tab === t.key ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="space-y-4">
            <h3 className="font-semibold">Essential Functions</h3>
            <div className="space-y-2">
              {functions.map((f) => (
                <div key={f.id} className="flex items-center justify-between bg-white border rounded px-4 py-2">
                  <div>
                    <span className="font-medium">P{f.priority}</span> {f.name}
                    {f.recoveryTimeObjective && <span className="text-xs text-gray-400 ml-2">RTO: {f.recoveryTimeObjective}min</span>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[f.status] || ''}`}>{f.status}</span>
                </div>
              ))}
              {functions.length === 0 && <p className="text-sm text-gray-500">No essential functions defined.</p>}
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded px-3 py-2 text-sm"
                placeholder="Log an activity..."
                value={newActivity}
                onChange={(e) => setNewActivity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && logActivity()}
              />
              <select className="border rounded px-2 text-sm" value={activityCategory} onChange={(e) => setActivityCategory(e.target.value)}>
                <option value="observation">Observation</option>
                <option value="decision">Decision</option>
                <option value="communication">Communication</option>
                <option value="resource_change">Resource Change</option>
              </select>
              <button onClick={logActivity} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Log</button>
            </div>
            <div className="space-y-1">
              {activityLogs.map((l) => (
                <div key={l.id} className="bg-white border rounded px-4 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">[{l.category}]</span>
                    <span className="text-xs text-gray-400">{l.actorName} · {l.source} · {new Date(l.loggedAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1">{l.activity}</div>
                  {l.correctsId && <div className="text-xs text-orange-500 mt-1">Corrects entry #{l.correctsId}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'personnel' && (
          <div className="space-y-2">
            {personnel.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-white border rounded px-4 py-2">
                <div>
                  <span className="font-medium">{p.userName}</span>
                  {p.assignment && <span className="text-sm text-gray-500 ml-2">· {p.assignment}</span>}
                  {p.locationText && <span className="text-sm text-gray-400 ml-2">@ {p.locationText}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${PERSONNEL_COLORS[p.status] || ''}`}>{p.status}</span>
                  <span className="text-xs text-gray-400">{p.checkedInVia} · {new Date(p.checkedInAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {personnel.length === 0 && <p className="text-sm text-gray-500">No personnel checked in yet.</p>}
          </div>
        )}

        {tab === 'resources' && (
          <div className="space-y-2">
            {resources.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-white border rounded px-4 py-2">
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-sm text-gray-500 ml-2">· {r.type} · Qty: {r.quantity}</span>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-gray-100">{r.status}</span>
              </div>
            ))}
            {resources.length === 0 && <p className="text-sm text-gray-500">No resources assigned.</p>}
          </div>
        )}

        {tab === 'comms' && (
          <div className="space-y-2">
            {commTrees.map((t) => (
              <div key={t.id} className="bg-white border rounded px-4 py-3">
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-gray-500 capitalize">{t.type} plan</div>
              </div>
            ))}
            {commTrees.length === 0 && <p className="text-sm text-gray-500">No communication trees defined.</p>}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
