import { DateTime } from 'luxon'
import MeshNode from '#models/mesh_node'
import PersonnelStatus from '#models/personnel_status'
import Resource from '#models/resource'

export interface PositionUpdate {
  nodeId: string
  latitude: number
  longitude: number
  altitude?: number
  callsign?: string
  source: 'mesh' | 'manual' | 'tak'
}

export interface MapMarker {
  id: string
  type: 'mesh_node' | 'resource' | 'personnel'
  name: string
  latitude: number
  longitude: number
  status?: string
  metadata?: Record<string, unknown>
}

export default class PositionService {
  /**
   * Update a node's position in the mesh_nodes table.
   */
  async updatePosition(update: PositionUpdate): Promise<MeshNode> {
    let node = await MeshNode.query().where('nodeId', update.nodeId).first()

    if (node) {
      node.latitude = update.latitude
      node.longitude = update.longitude
      if (update.altitude !== undefined) node.altitude = update.altitude
      if (update.callsign) node.longName = update.callsign
      node.isOnline = true
      node.lastHeardAt = DateTime.now()
      await node.save()
    } else {
      node = await MeshNode.create({
        nodeId: update.nodeId,
        longName: update.callsign || update.nodeId,
        latitude: update.latitude,
        longitude: update.longitude,
        altitude: update.altitude ?? null,
        isOnline: true,
        lastHeardAt: DateTime.now(),
      })
    }

    return node
  }

  /**
   * Get all map markers for the current state.
   * Combines mesh nodes, resources with locations, and personnel with locations.
   */
  async getAllMarkers(incidentId?: number): Promise<MapMarker[]> {
    const markers: MapMarker[] = []

    // Mesh nodes with positions
    const nodes = await MeshNode.query()
      .whereNotNull('latitude')
      .whereNotNull('longitude')
      .where('isOnline', true)

    for (const node of nodes) {
      if (node.latitude != null && node.longitude != null) {
        markers.push({
          id: `mesh-${node.nodeId}`,
          type: 'mesh_node',
          name: node.longName || node.shortName || node.nodeId,
          latitude: node.latitude,
          longitude: node.longitude,
          status: node.isOnline ? 'online' : 'offline',
          metadata: {
            batteryLevel: node.batteryLevel,
            snr: node.snr,
            lastHeard: node.lastHeardAt?.toISO(),
          },
        })
      }
    }

    // Resources with locations
    const resourceQuery = Resource.query()
      .whereNotNull('latitude')
      .whereNotNull('longitude')
    if (incidentId) {
      resourceQuery.where('assignedIncidentId', incidentId)
    }
    const resources = await resourceQuery

    for (const r of resources) {
      if (r.latitude != null && r.longitude != null) {
        markers.push({
          id: `resource-${r.id}`,
          type: 'resource',
          name: r.name,
          latitude: r.latitude,
          longitude: r.longitude,
          status: r.status,
          metadata: { type: r.type, quantity: r.quantity },
        })
      }
    }

    // Personnel with locations
    if (incidentId) {
      const personnel = await PersonnelStatus.query()
        .where('incidentId', incidentId)
        .whereNotNull('latitude')
        .whereNotNull('longitude')
        .preload('user')

      for (const p of personnel) {
        if (p.latitude != null && p.longitude != null) {
          markers.push({
            id: `personnel-${p.id}`,
            type: 'personnel',
            name: p.user?.fullName || `User ${p.userId}`,
            latitude: p.latitude,
            longitude: p.longitude,
            status: p.status,
            metadata: { assignment: p.assignment, checkedInVia: p.checkedInVia },
          })
        }
      }
    }

    return markers
  }
}
