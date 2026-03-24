import AppLayout from '../layouts/app_layout'
import { Head } from '@inertiajs/react'
import VoiceRecorder from '../components/voice_recorder'
import { useState } from 'react'
import { apiFetch } from '~/lib/fetch'

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
  nominal: 'text-green-400 bg-green-500/15 ring-1 ring-green-500/30',
  degraded: 'text-yellow-400 bg-yellow-500/15 ring-1 ring-yellow-500/30',
  failed: 'text-red-400 bg-red-500/15 ring-1 ring-red-500/30',
}

const PERSONNEL_COLORS: Record<string, string> = {
  available: 'bg-green-500/15 text-green-400 ring-1 ring-green-500/30',
  deployed: 'bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30',
  injured: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  unaccounted: 'bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30',
}

type Tab = 'overview' | 'activity' | 'personnel' | 'resources' | 'comms'

export default function IncidentDetail({ summary, functions, personnel, activityLogs, resources, commTrees }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [newActivity, setNewActivity] = useState('')
  const [activityCategory, setActivityCategory] = useState('observation')

  const logActivity = async () => {
    if (!newActivity.trim()) return
    await apiFetch(`/api/incidents/${summary.incident.id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: newActivity, category: activityCategory }),
    })
    window.location.reload()
  }

  const checkIn = async (status: string) => {
    await apiFetch(`/api/incidents/${summary.incident.id}/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    window.location.reload()
  }

  const updateStatus = async (status: string) => {
    await apiFetch(`/api/incidents/${summary.incident.id}/status`, {
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
      <Head title={summary.incident.name} />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <a href="/incidents" className="text-sm text-brand-400 hover:text-brand-300 transition-colors">&larr; All Incidents</a>
            <h1 className="text-2xl font-bold mt-1 text-white">{summary.incident.name}</h1>
            <div className="text-sm text-zinc-500">
              {summary.incident.type.replace(/_/g, ' ')} · Period {summary.incident.iapPeriod} · Commander: {summary.incident.commander || 'Unassigned'}
            </div>
          </div>
          <div className="flex gap-2">
            {summary.incident.status === 'declared' && (
              <button onClick={() => updateStatus('active')} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">Activate</button>
            )}
            {summary.incident.status === 'active' && (
              <button onClick={() => updateStatus('contained')} className="px-3 py-1.5 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors">Mark Contained</button>
            )}
            {(summary.incident.status === 'contained' || summary.incident.status === 'active') && (
              <button onClick={() => updateStatus('closed')} className="px-3 py-1.5 bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-zinc-600 transition-colors">Close</button>
            )}
          </div>
        </div>

        {/* Quick check-in bar */}
        <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-3 flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-300">Quick Check-In:</span>
          {['available', 'deployed'].map((s) => (
            <button
              key={s}
              onClick={() => checkIn(s)}
              className="px-3 py-1.5 bg-surface-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 capitalize transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-zinc-800 flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 pb-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-b-2 border-brand-500 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-white">Essential Functions</h3>
            <div className="space-y-2">
              {functions.map((f) => (
                <div key={f.id} className="flex items-center justify-between bg-surface-800 border border-zinc-800 rounded-xl px-4 py-3">
                  <div>
                    <span className="font-medium text-brand-400">P{f.priority}</span>
                    <span className="text-zinc-200 ml-2">{f.name}</span>
                    {f.recoveryTimeObjective && <span className="text-xs text-zinc-500 ml-2">RTO: {f.recoveryTimeObjective}min</span>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.status] || ''}`}>{f.status}</span>
                </div>
              ))}
              {functions.length === 0 && <p className="text-sm text-zinc-500 py-4 text-center">No essential functions defined.</p>}
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-surface-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
                placeholder="Log an activity..."
                value={newActivity}
                onChange={(e) => setNewActivity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && logActivity()}
              />
              <select
                className="bg-surface-900 border border-zinc-700 rounded-lg px-2 text-sm text-white focus:outline-none focus:border-brand-500"
                value={activityCategory}
                onChange={(e) => setActivityCategory(e.target.value)}
              >
                <option value="observation">Observation</option>
                <option value="decision">Decision</option>
                <option value="communication">Communication</option>
                <option value="resource_change">Resource Change</option>
              </select>
              <button onClick={logActivity} className="px-3 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors">Log</button>
              <VoiceRecorder compact incidentId={summary.incident.id} onCapture={() => window.location.reload()} />
            </div>
            <div className="space-y-2">
              {activityLogs.map((l) => (
                <div key={l.id} className="bg-surface-800 border border-zinc-800 rounded-xl px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-xs font-medium uppercase tracking-wide">{l.category}</span>
                    <span className="text-xs text-zinc-600">{l.actorName} · {l.source} · {new Date(l.loggedAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-zinc-200">{l.activity}</div>
                  {l.correctsId && <div className="text-xs text-orange-400 mt-1">Corrects entry #{l.correctsId}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'personnel' && (
          <div className="space-y-2">
            {personnel.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-surface-800 border border-zinc-800 rounded-xl px-4 py-3">
                <div>
                  <span className="font-medium text-white">{p.userName}</span>
                  {p.assignment && <span className="text-sm text-zinc-500 ml-2">· {p.assignment}</span>}
                  {p.locationText && <span className="text-sm text-zinc-600 ml-2">@ {p.locationText}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PERSONNEL_COLORS[p.status] || ''}`}>{p.status}</span>
                  <span className="text-xs text-zinc-600">{p.checkedInVia} · {new Date(p.checkedInAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {personnel.length === 0 && <p className="text-sm text-zinc-500 py-6 text-center">No personnel checked in yet.</p>}
          </div>
        )}

        {tab === 'resources' && (
          <div className="space-y-2">
            {resources.map((r) => (
              <div key={r.id} className="flex items-center justify-between bg-surface-800 border border-zinc-800 rounded-xl px-4 py-3">
                <div>
                  <span className="font-medium text-white">{r.name}</span>
                  <span className="text-sm text-zinc-500 ml-2">· {r.type} · Qty: {r.quantity}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30 font-medium">{r.status}</span>
              </div>
            ))}
            {resources.length === 0 && <p className="text-sm text-zinc-500 py-6 text-center">No resources assigned.</p>}
          </div>
        )}

        {tab === 'comms' && (
          <div className="space-y-2">
            {commTrees.map((t) => (
              <div key={t.id} className="bg-surface-800 border border-zinc-800 rounded-xl px-4 py-3">
                <div className="font-medium text-white">{t.name}</div>
                <div className="text-sm text-zinc-500 capitalize">{t.type} plan</div>
              </div>
            ))}
            {commTrees.length === 0 && <p className="text-sm text-zinc-500 py-6 text-center">No communication trees defined.</p>}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
