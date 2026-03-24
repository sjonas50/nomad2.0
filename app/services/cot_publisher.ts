import CoTService from '#services/cot_service'
import CoTListener from '#services/cot_listener'
import MeshNode from '#models/mesh_node'
import logger from '@adonisjs/core/services/logger'

/**
 * Publishes local data as CoT events to OpenTAKServer.
 * Bridges Meshtastic mesh nodes and incident declarations into the TAK ecosystem.
 */
export default class CoTPublisher {
  private cotService: CoTService
  private listener: CoTListener

  constructor(listener: CoTListener) {
    this.cotService = new CoTService()
    this.listener = listener
  }

  /**
   * Publish all online mesh node positions as CoT PLI events.
   */
  async publishMeshPositions(): Promise<number> {
    if (!this.listener.isConnected()) return 0

    const nodes = await MeshNode.query()
      .where('isOnline', true)
      .whereNotNull('latitude')
      .whereNotNull('longitude')

    let published = 0
    for (const node of nodes) {
      if (node.latitude == null || node.longitude == null) continue

      const xml = this.cotService.generatePLI({
        uid: `mesh-${node.nodeId}`,
        callsign: node.longName || node.shortName || node.nodeId,
        latitude: node.latitude,
        longitude: node.longitude,
        altitude: node.altitude || undefined,
        team: 'Mesh',
      })

      if (this.listener.send(xml)) {
        published++
      }
    }

    if (published > 0) {
      logger.info({ count: published }, 'Published mesh positions to TAK')
    }
    return published
  }

  /**
   * Publish an incident declaration as a CoT alert event.
   */
  publishIncidentAlert(input: {
    incidentId: number
    name: string
    type: string
    latitude?: number
    longitude?: number
  }): boolean {
    if (!this.listener.isConnected()) return false

    const xml = this.cotService.generateAlert({
      uid: `attic-incident-${input.incidentId}`,
      name: input.name,
      type: input.type,
      latitude: input.latitude || 0,
      longitude: input.longitude || 0,
      remarks: `Attic AI Incident: ${input.name} (${input.type})`,
    })

    return this.listener.send(xml)
  }
}
