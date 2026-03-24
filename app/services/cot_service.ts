import { createSocket, type Socket as DgramSocket } from 'node:dgram'
import CoT, { CoTParser } from '@tak-ps/node-cot'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

/**
 * Cursor-on-Target (CoT) service for TAK ecosystem interoperability.
 *
 * Uses @tak-ps/node-cot for proper CoT XML generation/parsing and
 * node:dgram for UDP multicast broadcast (TAK-server-free deployments).
 *
 * Supported CoT event types:
 * - a-f-G-U-C: Friendly ground unit (Position Location Information / PLI)
 * - b-m-p-s-p-i: Map marker / Point of Interest
 * - b-t-f: Free text (GeoChat messages)
 * - a-u-G: Unknown ground unit
 * - b-r-f-h-c: Alert/hazard
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoTEvent {
  uid: string
  type: string
  time: string
  start: string
  stale: string
  how: string
  latitude: number
  longitude: number
  altitude: number
  callsign: string | null
  remarks: string | null
  team: string | null
  role: string | null
}

export interface CoTPLI {
  uid: string
  callsign: string
  latitude: number
  longitude: number
  altitude: number
  team: string | null
  role: string | null
  how: string
  staleTime: string
}

export interface CoTGeoChat {
  uid: string
  sender: string
  message: string
  latitude: number
  longitude: number
  time: string
}

export interface GeoJSONPoint {
  type: 'Feature'
  geometry: {
    type: 'Point'
    coordinates: [number, number, number?]
  }
  properties: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export default class CoTService {
  private multicastAddress: string
  private multicastPort: number
  private udpSocket: DgramSocket | null = null
  private broadcasting = false

  constructor() {
    this.multicastAddress = env.get('COT_MULTICAST_ADDRESS', '239.2.3.1') as string
    this.multicastPort = env.get('COT_MULTICAST_PORT', 6969) as number
  }

  // -----------------------------------------------------------------------
  // UDP multicast lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialize the UDP multicast socket for broadcasting CoT events.
   */
  startBroadcasting(): void {
    if (this.udpSocket) return

    this.udpSocket = createSocket({ type: 'udp4', reuseAddr: true })

    this.udpSocket.on('error', (err) => {
      logger.error({ err }, 'CoT UDP multicast socket error')
      this.stopBroadcasting()
    })

    this.udpSocket.bind(() => {
      if (!this.udpSocket) return
      this.udpSocket.setBroadcast(true)
      try {
        this.udpSocket.setMulticastTTL(32)
        this.udpSocket.addMembership(this.multicastAddress)
      } catch (err) {
        logger.warn({ err }, 'Could not join multicast group (may still work for sending)')
      }
      this.broadcasting = true
      logger.info(
        { address: this.multicastAddress, port: this.multicastPort },
        'CoT UDP multicast broadcasting started'
      )
    })
  }

  /**
   * Tear down the UDP multicast socket.
   */
  stopBroadcasting(): void {
    if (this.udpSocket) {
      try {
        this.udpSocket.dropMembership(this.multicastAddress)
      } catch {
        // may not have joined yet
      }
      this.udpSocket.close()
      this.udpSocket = null
    }
    this.broadcasting = false
    logger.info('CoT UDP multicast broadcasting stopped')
  }

  /**
   * Whether the UDP multicast socket is active.
   */
  isBroadcasting(): boolean {
    return this.broadcasting
  }

  /**
   * Send raw CoT XML over UDP multicast.
   */
  sendMulticast(xml: string): boolean {
    if (!this.udpSocket || !this.broadcasting) return false

    const buf = Buffer.from(xml, 'utf-8')
    this.udpSocket.send(buf, 0, buf.length, this.multicastPort, this.multicastAddress, (err) => {
      if (err) {
        logger.warn({ err }, 'Failed to send CoT multicast packet')
      }
    })
    return true
  }

  // -----------------------------------------------------------------------
  // CoT creation helpers (using @tak-ps/node-cot)
  // -----------------------------------------------------------------------

  /**
   * Create a CoT position report (PLI) for a friendly ground unit.
   */
  createPositionReport(input: {
    uid: string
    callsign: string
    latitude: number
    longitude: number
    altitude?: number
    team?: string
    role?: string
    staleMins?: number
  }): CoT {
    const now = new Date().toISOString()
    const stale = new Date(Date.now() + (input.staleMins ?? 5) * 60000).toISOString()

    const detail: Record<string, unknown> = {
      contact: { _attributes: { callsign: input.callsign } },
      precisionlocation: { _attributes: { altsrc: 'GPS' } },
      track: { _attributes: { course: '0', speed: '0' } },
    }

    if (input.team) {
      detail.__group = {
        _attributes: {
          name: input.team,
          role: input.role || 'Team Member',
        },
      }
    }

    return new CoT({
      event: {
        _attributes: {
          version: '2.0',
          uid: input.uid,
          type: 'a-f-G-U-C',
          how: 'm-g',
          time: now,
          start: now,
          stale,
        },
        point: {
          _attributes: {
            lat: input.latitude,
            lon: input.longitude,
            hae: input.altitude ?? 0,
            ce: 35.0,
            le: 999999,
          },
        },
        detail,
      },
    })
  }

  /**
   * Create a CoT marker / Point of Interest.
   */
  createMarker(input: {
    uid: string
    name: string
    latitude: number
    longitude: number
    remarks?: string
    staleMins?: number
  }): CoT {
    const now = new Date().toISOString()
    const stale = new Date(Date.now() + (input.staleMins ?? 60) * 60000).toISOString()

    const detail: Record<string, unknown> = {
      contact: { _attributes: { callsign: input.name } },
    }
    if (input.remarks) {
      detail.remarks = { _text: input.remarks }
    }

    return new CoT({
      event: {
        _attributes: {
          version: '2.0',
          uid: input.uid,
          type: 'b-m-p-s-p-i',
          how: 'h-e',
          time: now,
          start: now,
          stale,
        },
        point: {
          _attributes: {
            lat: input.latitude,
            lon: input.longitude,
            hae: 0,
            ce: 9.9,
            le: 9999999.0,
          },
        },
        detail,
      },
    })
  }

  /**
   * Create a CoT alert event (e.g. incident declaration).
   */
  createAlert(input: {
    uid: string
    name: string
    type: string
    latitude: number
    longitude: number
    remarks?: string
  }): CoT {
    const now = new Date().toISOString()
    const stale = new Date(Date.now() + 60 * 60000).toISOString()

    return new CoT({
      event: {
        _attributes: {
          version: '2.0',
          uid: input.uid,
          type: 'b-r-f-h-c',
          how: 'h-e',
          time: now,
          start: now,
          stale,
        },
        point: {
          _attributes: {
            lat: input.latitude,
            lon: input.longitude,
            hae: 0,
            ce: 999999,
            le: 999999,
          },
        },
        detail: {
          contact: { _attributes: { callsign: input.name } },
          remarks: { _text: input.remarks || `Incident: ${input.name} (${input.type})` },
        },
      },
    })
  }

  // -----------------------------------------------------------------------
  // Parsing incoming CoT XML
  // -----------------------------------------------------------------------

  /**
   * Parse a CoT XML string into a structured CoTEvent.
   * Uses @tak-ps/node-cot for robust parsing.
   */
  parseEvent(xml: string): CoTEvent | null {
    try {
      const cot = CoTParser.from_xml(xml)
      const raw = cot.raw as any

      const eventAttrs = raw?.event?._attributes || {}
      const pointAttrs = raw?.event?.point?._attributes || {}
      const detail = raw?.event?.detail || {}
      const contactAttrs = detail?.contact?._attributes || {}
      const groupAttrs = detail?.__group?._attributes || {}
      const remarksText =
        detail?.remarks?._text || (detail?.remarks as any)?._cdata || null

      return {
        uid: String(eventAttrs.uid || ''),
        type: String(eventAttrs.type || ''),
        time: String(eventAttrs.time || ''),
        start: String(eventAttrs.start || ''),
        stale: String(eventAttrs.stale || ''),
        how: String(eventAttrs.how || 'h-e'),
        latitude: Number.parseFloat(String(pointAttrs.lat || '0')),
        longitude: Number.parseFloat(String(pointAttrs.lon || '0')),
        altitude: Number.parseFloat(String(pointAttrs.hae || '0')),
        callsign: contactAttrs.callsign || null,
        remarks: remarksText,
        team: groupAttrs.name || null,
        role: groupAttrs.role || null,
      }
    } catch (err) {
      logger.warn({ err, xmlLength: xml.length }, 'Failed to parse CoT event')
      return null
    }
  }

  // -----------------------------------------------------------------------
  // CoT <-> GeoJSON conversion
  // -----------------------------------------------------------------------

  /**
   * Convert a CoTEvent to a GeoJSON Feature for map rendering.
   */
  toGeoJSON(event: CoTEvent): GeoJSONPoint {
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [event.longitude, event.latitude, event.altitude],
      },
      properties: {
        uid: event.uid,
        type: event.type,
        callsign: event.callsign,
        remarks: event.remarks,
        team: event.team,
        role: event.role,
        how: event.how,
        time: event.time,
        stale: event.stale,
      },
    }
  }

  /**
   * Convert a GeoJSON Feature (Point) to a CoT XML string.
   * Useful for sending map-drawn features to TAK devices.
   */
  geoJSONToCoTXml(feature: GeoJSONPoint): string {
    const coords = feature.geometry.coordinates
    const props = feature.properties || {}

    const uid = (props.uid as string) || `nomad-${Date.now()}`
    const callsign = (props.callsign as string) || (props.name as string) || uid
    const cotType = (props.type as string) || 'a-f-G-U-C'
    const remarks = (props.remarks as string) || undefined

    const isPosition = cotType.startsWith('a-')

    if (isPosition) {
      const cot = this.createPositionReport({
        uid,
        callsign,
        latitude: coords[1],
        longitude: coords[0],
        altitude: coords[2],
        team: props.team as string | undefined,
        role: props.role as string | undefined,
      })
      return CoTParser.to_xml(cot)
    }

    const cot = this.createMarker({
      uid,
      name: callsign,
      latitude: coords[1],
      longitude: coords[0],
      remarks,
    })
    return CoTParser.to_xml(cot)
  }

  // -----------------------------------------------------------------------
  // Event classification helpers
  // -----------------------------------------------------------------------

  /**
   * Determine if a CoT event is a PLI (Position Location Information).
   */
  isPLI(event: CoTEvent): boolean {
    return event.type.startsWith('a-f-G') || event.type.startsWith('a-u-G')
  }

  /**
   * Determine if a CoT event is a GeoChat message.
   */
  isGeoChat(event: CoTEvent): boolean {
    return event.type.startsWith('b-t-f')
  }

  /**
   * Extract PLI data from a CoT event.
   */
  extractPLI(event: CoTEvent): CoTPLI | null {
    if (!this.isPLI(event)) return null
    return {
      uid: event.uid,
      callsign: event.callsign || event.uid,
      latitude: event.latitude,
      longitude: event.longitude,
      altitude: event.altitude,
      team: event.team,
      role: event.role,
      how: event.how,
      staleTime: event.stale,
    }
  }

  /**
   * Extract GeoChat message from a CoT event.
   */
  extractGeoChat(event: CoTEvent): CoTGeoChat | null {
    if (!this.isGeoChat(event)) return null
    return {
      uid: event.uid,
      sender: event.callsign || event.uid,
      message: event.remarks || '',
      latitude: event.latitude,
      longitude: event.longitude,
      time: event.time,
    }
  }

  // -----------------------------------------------------------------------
  // Legacy XML generation wrappers (keep backward compat with cot_publisher)
  // -----------------------------------------------------------------------

  /**
   * Generate a CoT PLI XML string. Legacy API — prefer createPositionReport().
   */
  generatePLI(input: {
    uid: string
    callsign: string
    latitude: number
    longitude: number
    altitude?: number
    team?: string
    role?: string
  }): string {
    return CoTParser.to_xml(this.createPositionReport(input))
  }

  /**
   * Generate a CoT alert XML string. Legacy API — prefer createAlert().
   */
  generateAlert(input: {
    uid: string
    name: string
    type: string
    latitude: number
    longitude: number
    remarks?: string
  }): string {
    return CoTParser.to_xml(this.createAlert(input))
  }
}
