import { DateTime } from 'luxon'
import Incident from '#models/incident'
import type { IncidentType, IncidentStatus } from '#models/incident'
import EssentialFunction from '#models/essential_function'
import Resource from '#models/resource'
import IcsActivityLog from '#models/ics_activity_log'
import type { ActivitySource, ActivityCategory } from '#models/ics_activity_log'
import PersonnelStatus from '#models/personnel_status'
import type { PersonnelStatusValue, CheckInMethod } from '#models/personnel_status'
import logger from '@adonisjs/core/services/logger'

export interface DeclareIncidentInput {
  name: string
  type: IncidentType
  description?: string
  incidentCommanderId?: number
}

export interface LogActivityInput {
  incidentId: number
  actorId?: number
  activity: string
  source?: ActivitySource
  category?: ActivityCategory
  correctsId?: number
}

export interface CheckInInput {
  userId: number
  incidentId: number
  status: PersonnelStatusValue
  locationText?: string
  latitude?: number
  longitude?: number
  assignment?: string
  checkedInVia?: CheckInMethod
}

export interface IncidentSummary {
  incident: {
    id: number
    name: string
    type: IncidentType
    status: IncidentStatus
    iapPeriod: number
    declaredAt: string
    commander: string | null
  }
  functions: {
    total: number
    nominal: number
    degraded: number
    failed: number
    items: Array<{ name: string; priority: number; status: string; rto: number | null }>
  }
  personnel: {
    total: number
    available: number
    deployed: number
    injured: number
    unaccounted: number
  }
  resources: {
    total: number
    available: number
    assigned: number
  }
  recentActivity: Array<{ activity: string; source: string; category: string; loggedAt: string }>
}

export default class ICSService {
  /**
   * Declare a new incident.
   */
  async declareIncident(input: DeclareIncidentInput): Promise<Incident> {
    const incident = await Incident.create({
      name: input.name,
      type: input.type,
      status: 'declared',
      iapPeriod: 1,
      description: input.description || null,
      incidentCommanderId: input.incidentCommanderId || null,
      declaredAt: DateTime.now(),
    })

    await IcsActivityLog.create({
      incidentId: incident.id,
      actorId: input.incidentCommanderId || null,
      activity: `Incident declared: ${input.name} (${input.type})`,
      source: 'manual',
      category: 'decision',
      loggedAt: DateTime.now(),
    })

    logger.info({ incidentId: incident.id, name: input.name }, 'Incident declared')
    return incident
  }

  /**
   * Update incident status.
   */
  async updateStatus(incidentId: number, status: IncidentStatus, actorId?: number): Promise<Incident> {
    const incident = await Incident.findOrFail(incidentId)
    const oldStatus = incident.status
    incident.status = status

    if (status === 'closed') {
      incident.closedAt = DateTime.now()
    }

    await incident.save()

    await IcsActivityLog.create({
      incidentId: incident.id,
      actorId: actorId || null,
      activity: `Incident status changed: ${oldStatus} → ${status}`,
      source: 'manual',
      category: 'decision',
      loggedAt: DateTime.now(),
    })

    logger.info({ incidentId, oldStatus, newStatus: status }, 'Incident status updated')
    return incident
  }

  /**
   * Log an activity entry (append-only).
   */
  async logActivity(input: LogActivityInput): Promise<IcsActivityLog> {
    const log = await IcsActivityLog.create({
      incidentId: input.incidentId,
      actorId: input.actorId || null,
      activity: input.activity,
      source: input.source || 'manual',
      category: input.category || 'observation',
      correctsId: input.correctsId || null,
      loggedAt: DateTime.now(),
    })
    return log
  }

  /**
   * Check in personnel for an incident.
   */
  async checkInPersonnel(input: CheckInInput): Promise<PersonnelStatus> {
    const existing = await PersonnelStatus.query()
      .where('userId', input.userId)
      .where('incidentId', input.incidentId)
      .first()

    if (existing) {
      existing.status = input.status
      existing.locationText = input.locationText || existing.locationText
      existing.latitude = input.latitude ?? existing.latitude
      existing.longitude = input.longitude ?? existing.longitude
      existing.assignment = input.assignment || existing.assignment
      existing.checkedInVia = input.checkedInVia || 'manual'
      existing.checkedInAt = DateTime.now()
      await existing.save()
      return existing
    }

    return PersonnelStatus.create({
      userId: input.userId,
      incidentId: input.incidentId,
      status: input.status,
      locationText: input.locationText || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      assignment: input.assignment || null,
      checkedInVia: input.checkedInVia || 'manual',
      checkedInAt: DateTime.now(),
    })
  }

  /**
   * Get the currently active incident (most recent declared/active).
   */
  async getActiveIncident(): Promise<Incident | null> {
    return Incident.query()
      .whereIn('status', ['declared', 'active'])
      .orderBy('declaredAt', 'desc')
      .first()
  }

  /**
   * Get a full summary of an incident.
   */
  async getIncidentSummary(incidentId: number): Promise<IncidentSummary> {
    const incident = await Incident.query()
      .where('id', incidentId)
      .preload('incidentCommander')
      .firstOrFail()

    const functions = await EssentialFunction.query()
      .where('incidentId', incidentId)
      .orderBy('priority', 'asc')

    const personnel = await PersonnelStatus.query()
      .where('incidentId', incidentId)

    const resources = await Resource.query()
      .where('assignedIncidentId', incidentId)

    const allResources = await Resource.query()

    const recentLogs = await IcsActivityLog.query()
      .where('incidentId', incidentId)
      .orderBy('loggedAt', 'desc')
      .limit(10)

    const personnelCounts = {
      available: personnel.filter((p) => p.status === 'available').length,
      deployed: personnel.filter((p) => p.status === 'deployed').length,
      injured: personnel.filter((p) => p.status === 'injured').length,
      unaccounted: personnel.filter((p) => p.status === 'unaccounted').length,
    }

    return {
      incident: {
        id: incident.id,
        name: incident.name,
        type: incident.type,
        status: incident.status,
        iapPeriod: incident.iapPeriod,
        declaredAt: incident.declaredAt.toISO()!,
        commander: incident.incidentCommander?.fullName || null,
      },
      functions: {
        total: functions.length,
        nominal: functions.filter((f) => f.status === 'nominal').length,
        degraded: functions.filter((f) => f.status === 'degraded').length,
        failed: functions.filter((f) => f.status === 'failed').length,
        items: functions.map((f) => ({
          name: f.name,
          priority: f.priority,
          status: f.status,
          rto: f.recoveryTimeObjective,
        })),
      },
      personnel: {
        total: personnel.length,
        ...personnelCounts,
      },
      resources: {
        total: allResources.length,
        available: allResources.filter((r) => r.status === 'available').length,
        assigned: resources.length,
      },
      recentActivity: recentLogs.map((l) => ({
        activity: l.activity,
        source: l.source,
        category: l.category,
        loggedAt: l.loggedAt.toISO()!,
      })),
    }
  }

  /**
   * Build an LLM context block summarizing active incident state.
   * Injected into the system prompt when an incident is active.
   */
  async buildContextBlock(): Promise<string | null> {
    const incident = await this.getActiveIncident()
    if (!incident) return null

    const summary = await this.getIncidentSummary(incident.id)

    const lines: string[] = [
      `## ACTIVE INCIDENT: ${summary.incident.name}`,
      `Type: ${summary.incident.type} | Status: ${summary.incident.status} | Period: ${summary.incident.iapPeriod}`,
      `Commander: ${summary.incident.commander || 'Unassigned'}`,
      `Declared: ${summary.incident.declaredAt}`,
      '',
      `### Essential Functions (${summary.functions.nominal} nominal, ${summary.functions.degraded} degraded, ${summary.functions.failed} failed)`,
    ]

    for (const fn of summary.functions.items) {
      const statusIcon = fn.status === 'nominal' ? 'OK' : fn.status === 'degraded' ? 'DEGRADED' : 'FAILED'
      const rto = fn.rto ? ` (RTO: ${fn.rto}min)` : ''
      lines.push(`- P${fn.priority} ${fn.name}: ${statusIcon}${rto}`)
    }

    lines.push('')
    lines.push(
      `### Personnel: ${summary.personnel.available} available, ${summary.personnel.deployed} deployed, ${summary.personnel.injured} injured, ${summary.personnel.unaccounted} unaccounted`
    )
    lines.push(
      `### Resources: ${summary.resources.available} available, ${summary.resources.assigned} assigned to incident`
    )

    if (summary.recentActivity.length > 0) {
      lines.push('')
      lines.push('### Recent Activity')
      for (const log of summary.recentActivity.slice(0, 5)) {
        lines.push(`- [${log.category}] ${log.activity} (${log.source}, ${log.loggedAt})`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Generate an AI-synthesized after-action report from activity logs.
   * Returns the raw log data formatted for LLM consumption.
   */
  async getAARData(incidentId: number): Promise<string> {
    const incident = await Incident.findOrFail(incidentId)
    const logs = await IcsActivityLog.query()
      .where('incidentId', incidentId)
      .preload('actor')
      .orderBy('loggedAt', 'asc')

    const lines: string[] = [
      `# After-Action Report: ${incident.name}`,
      `Type: ${incident.type}`,
      `Declared: ${incident.declaredAt.toISO()}`,
      incident.closedAt ? `Closed: ${incident.closedAt.toISO()}` : 'Status: Ongoing',
      '',
      '## Chronological Activity Log',
      '',
    ]

    for (const log of logs) {
      const actor = log.actor?.fullName || 'System'
      const correction = log.correctsId ? ` [corrects #${log.correctsId}]` : ''
      lines.push(`- ${log.loggedAt.toISO()} | ${actor} | [${log.category}] ${log.activity}${correction}`)
    }

    lines.push('')
    lines.push('## Instructions')
    lines.push('Synthesize the above activity log into a structured After-Action Report with:')
    lines.push('1. Executive Summary (what happened, key decisions, outcome)')
    lines.push('2. Timeline of Key Events')
    lines.push('3. What Went Well')
    lines.push('4. Areas for Improvement')
    lines.push('5. Recommendations')

    return lines.join('\n')
  }
}
