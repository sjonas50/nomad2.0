import type { HttpContext } from '@adonisjs/core/http'
import PositionService from '#services/position_service'
import GeofenceService from '#services/geofence_service'
import type { GeofenceType, GeoJSONPolygon } from '#models/geofence'

export default class MapController {
  /**
   * GET /map — Render the map page via Inertia.
   */
  async index(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    return ctx.inertia.render('map' as any, {})
  }

  /**
   * GET /api/map/markers — Get all map markers.
   */
  async markers(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const incidentId = ctx.request.qs().incidentId
      ? Number(ctx.request.qs().incidentId)
      : undefined

    const positionService = new PositionService()
    const markers = await positionService.getAllMarkers(incidentId)

    return ctx.response.ok({ markers })
  }

  /**
   * GET /api/map/geofences — List active geofences.
   */
  async geofences(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const incidentId = ctx.request.qs().incidentId
      ? Number(ctx.request.qs().incidentId)
      : undefined

    const service = new GeofenceService()
    const geofences = await service.listGeofences(incidentId)

    return ctx.response.ok({
      geofences: geofences.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        geometry: g.geometry,
        description: g.description,
        color: g.color,
        active: g.active,
      })),
    })
  }

  /**
   * POST /api/map/geofences — Create a geofence.
   */
  async createGeofence(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    if (user.role !== 'admin' && user.role !== 'operator') {
      return ctx.response.forbidden({ error: 'Operator access required' })
    }

    const { name, type, geometry, incidentId, description, color } = ctx.request.only([
      'name',
      'type',
      'geometry',
      'incidentId',
      'description',
      'color',
    ])

    if (!name || !type || !geometry) {
      return ctx.response.badRequest({ error: 'name, type, and geometry are required' })
    }

    const service = new GeofenceService()
    const geofence = await service.createGeofence({
      name,
      type: type as GeofenceType,
      geometry: geometry as GeoJSONPolygon,
      incidentId: incidentId ? Number(incidentId) : undefined,
      description,
      color,
    })

    return ctx.response.created({
      id: geofence.id,
      name: geofence.name,
      type: geofence.type,
    })
  }

  /**
   * POST /api/map/position — Update a node's position.
   */
  async updatePosition(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const { nodeId, latitude, longitude, altitude, callsign, source } = ctx.request.only([
      'nodeId',
      'latitude',
      'longitude',
      'altitude',
      'callsign',
      'source',
    ])

    if (!nodeId || latitude === undefined || longitude === undefined) {
      return ctx.response.badRequest({ error: 'nodeId, latitude, and longitude are required' })
    }

    const positionService = new PositionService()
    await positionService.updatePosition({
      nodeId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      altitude: altitude !== undefined ? Number(altitude) : undefined,
      callsign,
      source: source || 'manual',
    })

    return ctx.response.ok({ updated: true })
  }
}
