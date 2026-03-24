import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import ICSService from '#services/ics_service'
import type { IncidentType } from '#models/incident'

const VALID_TYPES: IncidentType[] = [
  'natural_disaster', 'infrastructure_failure', 'security', 'medical', 'cyber', 'pandemic', 'other',
]

const icsDeclareIncident: ToolHandler = {
  name: 'declare_incident',
  displayName: 'Declare Incident',
  description: 'Declare a new ICS/COOP incident and begin tracking',
  category: 'ics',
  parameters: [
    { name: 'name', type: 'string', description: 'Incident name', required: true },
    { name: 'type', type: 'string', description: `Incident type: ${VALID_TYPES.join(', ')}`, required: true },
    { name: 'description', type: 'string', description: 'Brief description', required: false },
  ],
  minimumRole: 'operator',
  requiresConfirmation: true,

  async execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const name = params.name as string
    const type = params.type as IncidentType
    const description = params.description as string | undefined

    if (!VALID_TYPES.includes(type)) {
      return { success: false, message: `Invalid incident type. Must be one of: ${VALID_TYPES.join(', ')}` }
    }

    const ics = new ICSService()
    const incident = await ics.declareIncident({
      name,
      type,
      description,
      incidentCommanderId: context.userId,
    })

    return {
      success: true,
      message: `Incident "${name}" declared (ID: ${incident.id}, Type: ${type}). Status: declared.`,
      data: { incidentId: incident.id, name, type, status: 'declared' },
    }
  },
}

export default icsDeclareIncident
