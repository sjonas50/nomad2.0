import AppLayout from '../layouts/app_layout'
import { useState } from 'react'

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
  declared: 'bg-yellow-100 text-yellow-800',
  active: 'bg-red-100 text-red-800',
  contained: 'bg-blue-100 text-blue-800',
  closed: 'bg-gray-100 text-gray-800',
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
    const res = await fetch('/api/incidents', {
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
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Incident Management</h1>
          <button
            onClick={() => setShowDeclare(!showDeclare)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Declare Incident
          </button>
        </div>

        {showDeclare && (
          <div className="bg-white border border-red-200 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-700">Declare New Incident</h2>
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="Incident name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select className="w-full border rounded px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="natural_disaster">Natural Disaster</option>
              <option value="infrastructure_failure">Infrastructure Failure</option>
              <option value="security">Security</option>
              <option value="medical">Medical</option>
              <option value="cyber">Cyber</option>
              <option value="pandemic">Pandemic</option>
              <option value="other">Other</option>
            </select>
            <textarea
              className="w-full border rounded px-3 py-2"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <button onClick={declareIncident} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
              Declare
            </button>
          </div>
        )}

        {activeSummary && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-red-800">
                ACTIVE: {activeSummary.incident.name}
              </h2>
              <a
                href={`/incidents/${activeSummary.incident.id}`}
                className="text-red-600 hover:underline text-sm"
              >
                View Details →
              </a>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded p-3 text-center">
                <div className="text-2xl font-bold">{activeSummary.functions.total}</div>
                <div className="text-sm text-gray-500">Functions</div>
                <div className="flex gap-1 justify-center mt-1">
                  {activeSummary.functions.nominal > 0 && (
                    <span className={`w-3 h-3 rounded-full ${FUNCTION_COLORS.nominal}`} title="Nominal" />
                  )}
                  {activeSummary.functions.degraded > 0 && (
                    <span className={`w-3 h-3 rounded-full ${FUNCTION_COLORS.degraded}`} title="Degraded" />
                  )}
                  {activeSummary.functions.failed > 0 && (
                    <span className={`w-3 h-3 rounded-full ${FUNCTION_COLORS.failed}`} title="Failed" />
                  )}
                </div>
              </div>
              <div className="bg-white rounded p-3 text-center">
                <div className="text-2xl font-bold">{activeSummary.personnel.deployed}</div>
                <div className="text-sm text-gray-500">Deployed</div>
              </div>
              <div className="bg-white rounded p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{activeSummary.personnel.unaccounted}</div>
                <div className="text-sm text-gray-500">Unaccounted</div>
              </div>
              <div className="bg-white rounded p-3 text-center">
                <div className="text-2xl font-bold">{activeSummary.resources.available}</div>
                <div className="text-sm text-gray-500">Resources Avail.</div>
              </div>
            </div>

            {activeSummary.recentActivity.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-2">Recent Activity</h3>
                <div className="space-y-1">
                  {activeSummary.recentActivity.slice(0, 3).map((a, i) => (
                    <div key={i} className="text-sm text-gray-700 bg-white rounded px-3 py-1">
                      <span className="text-gray-400">[{a.category}]</span> {a.activity}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold mb-3">All Incidents</h2>
            <div className="space-y-2">
              {incidents.map((i) => (
                <a
                  key={i.id}
                  href={`/incidents/${i.id}`}
                  className="block bg-white border rounded-lg p-4 hover:border-blue-300"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{i.name}</span>
                    <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[i.status] || ''}`}>
                      {i.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {i.type.replace(/_/g, ' ')} · Period {i.iapPeriod} · {new Date(i.declaredAt).toLocaleDateString()}
                  </div>
                </a>
              ))}
              {incidents.length === 0 && (
                <p className="text-gray-500 text-sm">No incidents declared yet.</p>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Playbook Templates</h2>
            {icsTemplates.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-500 mb-2">ICS (Government/Emergency)</h3>
                <div className="space-y-1">
                  {icsTemplates.map((t) => (
                    <div key={t.id} className="bg-white border rounded px-3 py-2 text-sm">
                      {t.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {bcpTemplates.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 mb-2">BCP (Enterprise)</h3>
                <div className="space-y-1">
                  {bcpTemplates.map((t) => (
                    <div key={t.id} className="bg-white border rounded px-3 py-2 text-sm">
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
