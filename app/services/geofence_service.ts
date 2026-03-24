import Geofence from '#models/geofence'
import type { GeofenceType, GeoJSONPolygon } from '#models/geofence'
import logger from '@adonisjs/core/services/logger'

export interface GeofenceAlert {
  geofenceId: number
  geofenceName: string
  geofenceType: GeofenceType
  event: 'enter' | 'exit'
  nodeId: string
  latitude: number
  longitude: number
}

export default class GeofenceService {
  /**
   * Check if a point is inside a GeoJSON polygon using ray-casting algorithm.
   * Pure implementation — no external dependencies needed.
   */
  pointInPolygon(lat: number, lon: number, polygon: GeoJSONPolygon): boolean {
    const coords = polygon.coordinates[0] // Outer ring
    if (!coords || coords.length < 3) return false

    let inside = false
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const xi = coords[i][0] // longitude
      const yi = coords[i][1] // latitude
      const xj = coords[j][0]
      const yj = coords[j][1]

      const intersect =
        yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi

      if (intersect) inside = !inside
    }
    return inside
  }

  /**
   * Check a position against all active geofences.
   * Returns alerts for any boundary crossings.
   */
  async checkPosition(
    nodeId: string,
    latitude: number,
    longitude: number,
    previouslyInside?: Set<number>
  ): Promise<{ alerts: GeofenceAlert[]; currentlyInside: Set<number> }> {
    const geofences = await Geofence.query().where('active', true)
    const alerts: GeofenceAlert[] = []
    const currentlyInside = new Set<number>()

    for (const fence of geofences) {
      const inside = this.pointInPolygon(latitude, longitude, fence.geometry)

      if (inside) {
        currentlyInside.add(fence.id)
        if (previouslyInside && !previouslyInside.has(fence.id)) {
          alerts.push({
            geofenceId: fence.id,
            geofenceName: fence.name,
            geofenceType: fence.type,
            event: 'enter',
            nodeId,
            latitude,
            longitude,
          })
        }
      } else if (previouslyInside?.has(fence.id)) {
        alerts.push({
          geofenceId: fence.id,
          geofenceName: fence.name,
          geofenceType: fence.type,
          event: 'exit',
          nodeId,
          latitude,
          longitude,
        })
      }
    }

    if (alerts.length > 0) {
      logger.info({ nodeId, alerts: alerts.length }, 'Geofence alerts triggered')
    }

    return { alerts, currentlyInside }
  }

  /**
   * Create a geofence.
   */
  async createGeofence(input: {
    name: string
    type: GeofenceType
    geometry: GeoJSONPolygon
    incidentId?: number
    description?: string
    color?: string
  }): Promise<Geofence> {
    return Geofence.create({
      name: input.name,
      type: input.type,
      geometry: input.geometry,
      incidentId: input.incidentId || null,
      description: input.description || null,
      color: input.color || null,
      active: true,
    })
  }

  /**
   * List geofences, optionally filtered by incident.
   */
  async listGeofences(incidentId?: number): Promise<Geofence[]> {
    const query = Geofence.query().where('active', true)
    if (incidentId) {
      query.where((q) => {
        q.where('incidentId', incidentId).orWhereNull('incidentId')
      })
    }
    return query.orderBy('createdAt', 'desc')
  }
}
