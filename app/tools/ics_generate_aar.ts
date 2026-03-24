import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import ICSService from '#services/ics_service'

const icsGenerateAAR: ToolHandler = {
  name: 'generate_aar',
  displayName: 'Generate After-Action Report',
  description: 'Generate an AI-synthesized after-action report from incident activity logs',
  category: 'ics',
  parameters: [
    { name: 'incident_id', type: 'number', description: 'Incident ID (uses active incident if omitted)', required: false },
  ],
  minimumRole: 'operator',
  requiresConfirmation: false,

  async execute(params: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const ics = new ICSService()
    let incidentId = params.incident_id as number | undefined

    if (!incidentId) {
      const active = await ics.getActiveIncident()
      if (!active) {
        return { success: false, message: 'No active incident and no incident_id provided.' }
      }
      incidentId = active.id
    }

    const aarData = await ics.getAARData(incidentId)

    return {
      success: true,
      message: aarData,
      data: { incidentId, type: 'aar_prompt' },
    }
  },
}

export default icsGenerateAAR
