import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import Resource from '#models/resource'
import ICSService from '#services/ics_service'

const icsResourceStatus: ToolHandler = {
  name: 'resource_status',
  displayName: 'Resource Status',
  description: 'View current resource inventory and status for the active incident',
  category: 'ics',
  parameters: [
    { name: 'type_filter', type: 'string', description: 'Filter by resource type (optional)', required: false },
  ],
  minimumRole: 'viewer',
  requiresConfirmation: false,

  async execute(params: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const typeFilter = params.type_filter as string | undefined

    const ics = new ICSService()
    const incident = await ics.getActiveIncident()

    let query = Resource.query()
    if (typeFilter) {
      query = query.where('type', 'like', `%${typeFilter}%`)
    }
    if (incident) {
      query = query.where((q) => {
        q.where('assignedIncidentId', incident.id).orWhereNull('assignedIncidentId')
      })
    }

    const resources = await query.orderBy('type', 'asc')

    const summary = {
      total: resources.length,
      available: resources.filter((r) => r.status === 'available').length,
      assigned: resources.filter((r) => r.status === 'assigned').length,
      outOfService: resources.filter((r) => r.status === 'out_of_service').length,
    }

    const items = resources.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      quantity: r.quantity,
      status: r.status,
      expiry: r.expiryDate,
    }))

    return {
      success: true,
      message: `Resources: ${summary.total} total (${summary.available} available, ${summary.assigned} assigned, ${summary.outOfService} out of service)`,
      data: { summary, items },
    }
  },
}

export default icsResourceStatus
