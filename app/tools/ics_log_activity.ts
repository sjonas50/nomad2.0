import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import ICSService from '#services/ics_service'
import type { ActivityCategory } from '#models/ics_activity_log'

const VALID_CATEGORIES: ActivityCategory[] = ['decision', 'observation', 'communication', 'resource_change']

const icsLogActivity: ToolHandler = {
  name: 'log_activity',
  displayName: 'Log Activity',
  description: 'Log an activity entry to the active incident (ICS-214 style)',
  category: 'ics',
  parameters: [
    { name: 'activity', type: 'string', description: 'Activity description', required: true },
    { name: 'category', type: 'string', description: `Category: ${VALID_CATEGORIES.join(', ')}`, required: false, default: 'observation' },
  ],
  minimumRole: 'viewer',
  requiresConfirmation: false,

  async execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const activity = params.activity as string
    const category = (params.category as ActivityCategory) || 'observation'

    if (!VALID_CATEGORIES.includes(category)) {
      return { success: false, message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }
    }

    const ics = new ICSService()
    const incident = await ics.getActiveIncident()
    if (!incident) {
      return { success: false, message: 'No active incident. Declare an incident first.' }
    }

    const log = await ics.logActivity({
      incidentId: incident.id,
      actorId: context.userId,
      activity,
      source: 'ai_extracted',
      category,
    })

    return {
      success: true,
      message: `Activity logged to incident "${incident.name}" (Log #${log.id}, Category: ${category})`,
      data: { logId: log.id, incidentId: incident.id, category },
    }
  },
}

export default icsLogActivity
