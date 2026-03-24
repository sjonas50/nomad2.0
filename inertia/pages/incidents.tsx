import AppLayout from '../layouts/app_layout'
import { Head } from '@inertiajs/react'
import { useState } from 'react'
import { apiFetch } from '~/lib/fetch'

interface Incident {
  id: number
  name: string
  type: string
  status: string
  iapPeriod: number
  declaredAt: string
  closedAt: string | null
}

interface IncidentSummary {
  incident: { id: number; name: string; type: string; status: string; iapPeriod: number; commander: string | null }
  functions: { total: number; nominal: number; degraded: number; failed: number }
  personnel: { total: number; available: number; deployed: number; injured: number; unaccounted: number }
  resources: { total: number; available: number; assigned: number }
  recentActivity: Array<{ activity: string; source: string; category: string; loggedAt: string }>
}

interface Template {
  id: number
  slug: string
  category: string
  name: string
}

interface Props {
  incidents: Incident[]
  activeSummary: IncidentSummary | null
  templates: Template[]
}

const STATUS_COLORS: Record<string, string> = {
  declared: 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30',
  active: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
  contained: 'bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30',
  closed: 'bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30',
}

const FUNCTION_COLORS: Record<string, string> = {
  nominal: 'bg-green-500',
  degraded: 'bg-yellow-500',
  failed: 'bg-red-500',
}

export default function Incidents({ incidents, activeSummary, templates }: Props) {
  const [showDeclare, setShowDeclare] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('natural_disaster')
  const [description, setDescription] = useState('')

  const declareIncident = async () => {
    const res = await apiFetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, description }),
    })
    if (res.ok) {
      window.location.reload()
    }
  }

  const icsTemplates = templates.filter((t) => t.category === 'ics')
  const bcpTemplates = templates.filter((t) => t.category === 'bcp')

  return (
    <AppLayout>
      <Head title="Incidents" />
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Incident Management</h1>
          <button
            onClick={() => setShowDeclare(!showDeclare)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors"
          >
            Declare Incident
          </button>
        </div>

        {showDeclare && (
          <div className="bg-surface-800 border border-red-500/30 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-400">Declare New Incident</h2>
            <input
              className="w-full bg-surface-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              placeholder="Incident name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select
              className="w-full bg-surface-900 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-500"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="natural_disaster">Natural Disaster</option>
              <option value="infrastructure_failure">Infrastructure Failure</option>
              <option value="security">Security</option>
              <option value="medical">Medical</option>
              <option value="cyber">Cyber</option>
              <option value="pandemic">Pandemic</option>
              <option value="other">Other</option>
            </select>
            <textarea
              className="w-full bg-surface-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <button onClick={declareIncident} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors">
              Declare
            </button>
          </div>
        )}

        {activeSummary && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-red-400">
                ACTIVE: {activeSummary.incident.name}
              </h2>
              <a
                href={`/incidents/${activeSummary.incident.id}`}
                className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
              >
                View Details &rarr;
              </a>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-surface-800 rounded-lg p-3 text-center border border-zinc-800">
                <div className="text-2xl font-bold text-white">{activeSummary.functions.total}</div>
                <div className="text-xs text-zinc-500 mt-0.5">Functions</div>
                <div className="flex gap-1 justify-center mt-1.5">
                  {activeSummary.functions.nominal > 0 && (
                    <span className={`w-2.5 h-2.5 rounded-full ${FUNCTION_COLORS.nominal}`} title="Nominal" />
                  )}
                  {activeSummary.functions.degraded > 0 && (
                    <span className={`w-2.5 h-2.5 rounded-full ${FUNCTION_COLORS.degraded}`} title="Degraded" />
                  )}
                  {activeSummary.functions.failed > 0 && (
                    <span className={`w-2.5 h-2.5 rounded-full ${FUNCTION_COLORS.failed}`} title="Failed" />
                  )}
                </div>
              </div>
              <div className="bg-surface-800 rounded-lg p-3 text-center border border-zinc-800">
                <div className="text-2xl font-bold text-white">{activeSummary.personnel.deployed}</div>
                <div className="text-xs text-zinc-500 mt-0.5">Deployed</div>
              </div>
              <div className="bg-surface-800 rounded-lg p-3 text-center border border-zinc-800">
                <div className="text-2xl font-bold text-red-400">{activeSummary.personnel.unaccounted}</div>
                <div className="text-xs text-zinc-500 mt-0.5">Unaccounted</div>
              </div>
              <div className="bg-surface-800 rounded-lg p-3 text-center border border-zinc-800">
                <div className="text-2xl font-bold text-white">{activeSummary.resources.available}</div>
                <div className="text-xs text-zinc-500 mt-0.5">Resources Avail.</div>
              </div>
            </div>

            {activeSummary.recentActivity.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Recent Activity</h3>
                <div className="space-y-1">
                  {activeSummary.recentActivity.slice(0, 3).map((a, i) => (
                    <div key={i} className="text-sm text-zinc-300 bg-surface-800 rounded-lg px-3 py-2 border border-zinc-800">
                      <span className="text-zinc-500">[{a.category}]</span> {a.activity}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-3 text-white">All Incidents</h2>
            <div className="space-y-2">
              {incidents.map((i) => (
                <a
                  key={i.id}
                  href={`/incidents/${i.id}`}
                  className="block bg-surface-800 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{i.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[i.status] || ''}`}>
                      {i.status}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-500 mt-1">
                    {i.type.replace(/_/g, ' ')} · Period {i.iapPeriod} · {new Date(i.declaredAt).toLocaleDateString()}
                  </div>
                </a>
              ))}
              {incidents.length === 0 && (
                <p className="text-zinc-500 text-sm py-6 text-center">No incidents declared yet.</p>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3 text-white">Playbook Templates</h2>
            {icsTemplates.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">ICS (Government/Emergency)</h3>
                <div className="space-y-1">
                  {icsTemplates.map((t) => (
                    <div key={t.id} className="bg-surface-800 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300">
                      {t.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bcpTemplates.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">BCP (Enterprise)</h3>
                <div className="space-y-1">
                  {bcpTemplates.map((t) => (
                    <div key={t.id} className="bg-surface-800 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300">
                      {t.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
