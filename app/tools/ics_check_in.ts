import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import ICSService from '#services/ics_service'
import type { PersonnelStatusValue } from '#models/personnel_status'

const VALID_STATUSES: PersonnelStatusValue[] = ['available', 'deployed', 'injured', 'unaccounted']

const icsCheckIn: ToolHandler = {
  name: 'check_in',
  displayName: 'Personnel Check-In',
  description: 'Check in personnel status for the active incident (PAR)',
  category: 'ics',
  parameters: [
    { name: 'status', type: 'string', description: `Status: ${VALID_STATUSES.join(', ')}`, required: true },
    { name: 'location', type: 'string', description: 'Current location description', required: false },
    { name: 'assignment', type: 'string', description: 'Current task assignment', required: false },
  ],
  minimumRole: 'viewer',
  requiresConfirmation: false,

  async execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const status = params.status as PersonnelStatusValue
    const location = params.location as string | undefined
    const assignment = params.assignment as string | undefined

    if (!VALID_STATUSES.includes(status)) {
      return { success: false, message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }
    }

    const ics = new ICSService()
    const incident = await ics.getActiveIncident()
    if (!incident) {
      return { success: false, message: 'No active incident. Declare an incident first.' }
    }

    await ics.checkInPersonnel({
      userId: context.userId,
      incidentId: incident.id,
      status,
      locationText: location,
      checkedInVia: 'manual',
      assignment,
    })

    return {
      success: true,
      message: `Checked in as "${status}" for incident "${incident.name}"${location ? ` at ${location}` : ''}`,
      data: { incidentId: incident.id, status, location },
    }
  },
}

export default icsCheckIn
