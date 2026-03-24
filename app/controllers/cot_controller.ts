import type { HttpContext } from '@adonisjs/core/http'
import CoTService from '#services/cot_service'
import { CoTParser } from '@tak-ps/node-cot'
import PositionService from '#services/position_service'
import logger from '@adonisjs/core/services/logger'

/**
 * Singleton CoTService so the UDP socket persists across requests.
 */
let cotService: CoTService | null = null

function getCotService(): CoTService {
  if (!cotService) {
    cotService = new CoTService()
  }
  return cotService
}

export default class CotController {
  /**
   * POST /api/cot/send
   *
   * Send a single CoT message (position report or marker) via UDP multicast.
   * Starts the multicast socket automatically if not already running.
   */
  async send(ctx: HttpContext) {
    ctx.auth.getUserOrFail()

    const { type, uid, callsign, name, latitude, longitude, altitude, remarks, team, role } =
      ctx.request.only([
        'type',
        'uid',
        'callsign',
        'name',
        'latitude',
        'longitude',
        'altitude',
        'remarks',
        'team',
        'role',
      ])

    if (latitude === undefined || longitude === undefined) {
      return ctx.response.badRequest({ error: 'latitude and longitude are required' })
    }

    const service = getCotService()

    // Auto-start broadcasting if not active
    if (!service.isBroadcasting()) {
      service.startBroadcasting()
    }

    let xml: string

    if (type === 'marker' || type === 'poi') {
      if (!name && !callsign) {
        return ctx.response.badRequest({ error: 'name is required for markers' })
      }
      const cot = service.createMarker({
        uid: uid || `nomad-marker-${Date.now()}`,
        name: name || callsign,
        latitude: Number(latitude),
        longitude: Number(longitude),
        remarks,
      })
      xml = CoTParser.to_xml(cot)
    } else {
      // Default: position report
      if (!callsign && !name) {
        return ctx.response.badRequest({ error: 'callsign is required for position reports' })
      }
      const cot = service.createPositionReport({
        uid: uid || `nomad-unit-${Date.now()}`,
        callsign: callsign || name,
        latitude: Number(latitude),
        longitude: Number(longitude),
        altitude: altitude !== undefined ? Number(altitude) : undefined,
        team,
        role,
      })
      xml = CoTParser.to_xml(cot)
    }

    const sent = service.sendMulticast(xml)

    if (!sent) {
      logger.warn('CoT multicast send failed — socket may not be ready')
      return ctx.response.serviceUnavailable({ error: 'Multicast socket not available' })
    }

    logger.info({ uid: uid || 'auto', type: type || 'position' }, 'CoT message sent via multicast')

    return ctx.response.ok({ sent: true, xml })
  }

  /**
   * POST /api/cot/broadcast-markers
   *
   * Broadcast all current map markers as CoT events to TAK devices
   * listening on the multicast group.
   */
  async broadcastMarkers(ctx: HttpContext) {
    ctx.auth.getUserOrFail()

    const incidentId = ctx.request.input('incidentId')
      ? Number(ctx.request.input('incidentId'))
      : undefined

    const service = getCotService()
    const positionService = new PositionService()

    // Auto-start broadcasting if not active
    if (!service.isBroadcasting()) {
      service.startBroadcasting()
    }

    const markers = await positionService.getAllMarkers(incidentId)
    let sentCount = 0

    for (const marker of markers) {
      const cot = service.createPositionReport({
        uid: marker.id,
        callsign: marker.name,
        latitude: marker.latitude,
        longitude: marker.longitude,
        team: marker.type === 'mesh_node' ? 'Mesh' : marker.type === 'resource' ? 'Resources' : 'Personnel',
      })

      if (service.sendMulticast(CoTParser.to_xml(cot))) {
        sentCount++
      }
    }

    logger.info({ total: markers.length, sent: sentCount }, 'Broadcast markers as CoT via multicast')

    return ctx.response.ok({
      total: markers.length,
      sent: sentCount,
      broadcasting: service.isBroadcasting(),
    })
  }

  /**
   * GET /api/cot/status
   *
   * Check whether CoT UDP multicast broadcasting is active.
   */
  async status(ctx: HttpContext) {
    ctx.auth.getUserOrFail()

    const service = getCotService()

    return ctx.response.ok({
      broadcasting: service.isBroadcasting(),
      multicastAddress: process.env.COT_MULTICAST_ADDRESS || '239.2.3.1',
      multicastPort: Number(process.env.COT_MULTICAST_PORT || 6969),
    })
  }
}
