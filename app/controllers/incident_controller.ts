import type { HttpContext } from '@adonisjs/core/http'
import ICSService from '#services/ics_service'
import Incident from '#models/incident'
import type { IncidentType, IncidentStatus } from '#models/incident'
import EssentialFunction from '#models/essential_function'
import Resource from '#models/resource'
import IcsActivityLog from '#models/ics_activity_log'
import PersonnelStatus from '#models/personnel_status'
import CommunicationTree from '#models/communication_tree'
import PromptTemplate from '#models/prompt_template'

const VALID_TYPES: IncidentType[] = [
  'natural_disaster', 'infrastructure_failure', 'security', 'medical', 'cyber', 'pandemic', 'other',
]
const VALID_STATUSES: IncidentStatus[] = ['declared', 'active', 'contained', 'closed']

export default class IncidentController {
  /**
   * Incident dashboard page.
   * GET /incidents
   */
  async index({ inertia }: HttpContext) {
    const ics = new ICSService()
    const incidents = await Incident.query().orderBy('declaredAt', 'desc').limit(50)
    const activeIncident = await ics.getActiveIncident()

    let activeSummary = null
    if (activeIncident) {
      activeSummary = await ics.getIncidentSummary(activeIncident.id)
    }

    const templates = await PromptTemplate.query()
      .whereIn('category', ['ics', 'bcp'])
      .where('isActive', true)
      .orderBy('category', 'asc')

    return inertia.render('incidents' as any, {
      incidents: incidents.map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        status: i.status,
        iapPeriod: i.iapPeriod,
        declaredAt: i.declaredAt?.toISO(),
        closedAt: i.closedAt?.toISO(),
      })),
      activeSummary,
      templates: templates.map((t) => ({
        id: t.id,
        slug: t.slug,
        category: t.category,
        name: t.name,
      })),
    })
  }

  /**
   * Incident detail page.
   * GET /incidents/:id
   */
  async show({ params, inertia }: HttpContext) {
    const ics = new ICSService()
    const summary = await ics.getIncidentSummary(params.id)

    const functions = await EssentialFunction.query()
      .where('incidentId', params.id)
      .orderBy('priority', 'asc')

    const personnel = await PersonnelStatus.query()
      .where('incidentId', params.id)
      .preload('user')

    const logs = await IcsActivityLog.query()
      .where('incidentId', params.id)
      .preload('actor')
      .orderBy('loggedAt', 'desc')
      .limit(100)

    const resources = await Resource.query()
      .where('assignedIncidentId', params.id)

    const commTrees = await CommunicationTree.query()
      .where((q) => {
        q.where('incidentId', params.id).orWhereNull('incidentId')
      })

    return inertia.render('incident_detail' as any, {
      summary,
      functions: functions.map((f) => ({
        id: f.id,
        name: f.name,
        priority: f.priority,
        status: f.status,
        recoveryTimeObjective: f.recoveryTimeObjective,
        procedures: f.procedures,
      })),
      personnel: personnel.map((p) => ({
        id: p.id,
        userId: p.userId,
        userName: p.user?.fullName || 'Unknown',
        status: p.status,
        locationText: p.locationText,
        assignment: p.assignment,
        checkedInAt: p.checkedInAt?.toISO(),
        checkedInVia: p.checkedInVia,
      })),
      activityLogs: logs.map((l) => ({
        id: l.id,
        activity: l.activity,
        source: l.source,
        category: l.category,
        actorName: l.actor?.fullName || 'System',
        loggedAt: l.loggedAt?.toISO(),
        correctsId: l.correctsId,
      })),
      resources: resources.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        quantity: r.quantity,
        status: r.status,
      })),
      commTrees: commTrees.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        treeData: t.treeData,
      })),
    })
  }

  // --- API Endpoints ---

  /**
   * Declare a new incident.
   * POST /api/incidents
   */
  async create({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!user.isOperator) {
      return response.forbidden({ error: 'Operator or admin role required' })
    }

    const { name, type, description } = request.only(['name', 'type', 'description'])

    if (!name || !type) {
      return response.badRequest({ error: 'Name and type are required' })
    }
    if (!VALID_TYPES.includes(type)) {
      return response.badRequest({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` })
    }

    const ics = new ICSService()
    const incident = await ics.declareIncident({
      name,
      type,
      description,
      incidentCommanderId: user.id,
    })

    return response.created({
      id: incident.id,
      name: incident.name,
      type: incident.type,
      status: incident.status,
    })
  }

  /**
   * Update incident status.
   * PATCH /api/incidents/:id/status
   */
  async updateStatus({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!user.isOperator) {
      return response.forbidden({ error: 'Operator or admin role required' })
    }

    const { status } = request.only(['status'])
    if (!VALID_STATUSES.includes(status)) {
      return response.badRequest({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` })
    }

    const ics = new ICSService()
    const incident = await ics.updateStatus(params.id, status, user.id)

    return { id: incident.id, status: incident.status }
  }

  /**
   * Log an activity.
   * POST /api/incidents/:id/activity
   */
  async logActivity({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { activity, category } = request.only(['activity', 'category'])

    if (!activity) {
      return response.badRequest({ error: 'Activity text is required' })
    }

    const ics = new ICSService()
    const log = await ics.logActivity({
      incidentId: params.id,
      actorId: user.id,
      activity,
      source: 'manual',
      category: category || 'observation',
    })

    return response.created({ id: log.id, loggedAt: log.loggedAt?.toISO() })
  }

  /**
   * Check in personnel.
   * POST /api/incidents/:id/check-in
   */
  async checkIn({ params, request, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const { status, location, assignment } = request.only(['status', 'location', 'assignment'])

    const ics = new ICSService()
    const ps = await ics.checkInPersonnel({
      userId: user.id,
      incidentId: params.id,
      status: status || 'available',
      locationText: location,
      assignment,
      checkedInVia: 'manual',
    })

    return { id: ps.id, status: ps.status, checkedInAt: ps.checkedInAt?.toISO() }
  }

  /**
   * Get incident summary (API).
   * GET /api/incidents/:id/summary
   */
  async summary({ params }: HttpContext) {
    const ics = new ICSService()
    return ics.getIncidentSummary(params.id)
  }

  /**
   * Get AAR data for AI generation.
   * GET /api/incidents/:id/aar
   */
  async aar({ params }: HttpContext) {
    const ics = new ICSService()
    const aarData = await ics.getAARData(params.id)
    return { data: aarData }
  }

  /**
   * Manage essential functions.
   * POST /api/incidents/:id/functions
   */
  async createFunction({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!user.isOperator) {
      return response.forbidden({ error: 'Operator or admin role required' })
    }

    const { name, priority, recoveryTimeObjective } = request.only(['name', 'priority', 'recoveryTimeObjective'])
    if (!name) {
      return response.badRequest({ error: 'Function name is required' })
    }

    const fn = await EssentialFunction.create({
      incidentId: params.id,
      name,
      priority: priority || 2,
      status: 'nominal',
      recoveryTimeObjective: recoveryTimeObjective || null,
    })

    return response.created({ id: fn.id, name: fn.name, priority: fn.priority })
  }

  /**
   * Update essential function status.
   * PATCH /api/incidents/functions/:id
   */
  async updateFunction({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!user.isOperator) {
      return response.forbidden({ error: 'Operator or admin role required' })
    }

    const fn = await EssentialFunction.findOrFail(params.id)
    const { status, name, priority } = request.only(['status', 'name', 'priority'])

    if (status) fn.status = status
    if (name) fn.name = name
    if (priority) fn.priority = priority
    await fn.save()

    return { id: fn.id, name: fn.name, status: fn.status }
  }
}
