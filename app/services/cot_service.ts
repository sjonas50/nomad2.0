import logger from '@adonisjs/core/services/logger'

/**
 * Cursor-on-Target (CoT) XML service for TAK ecosystem interoperability.
 *
 * Supported CoT event types:
 * - a-f-G-U-C: Friendly ground unit (Position Location Information / PLI)
 * - b-t-f: Free text (GeoChat messages)
 * - a-u-G: Unknown ground unit
 * - b-r-f-h-c: Alert/hazard
 */

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

export default class CoTService {
  /**
   * Parse a CoT XML event string into a structured object.
   */
  parseEvent(xml: string): CoTEvent | null {
    try {
      // Simple regex-based XML parser for CoT events
      // CoT XML is well-structured and predictable, no need for full XML parser
      const eventMatch = xml.match(
        /<event\s+([^>]+)>/
      )
      if (!eventMatch) return null

      const attrs = this.parseAttributes(eventMatch[1])
      const pointMatch = xml.match(/<point\s+([^>]*)\/>/)
      const pointAttrs = pointMatch ? this.parseAttributes(pointMatch[1]) : {}

      const contactMatch = xml.match(/<contact\s+([^>]*)\/>/)
      const contactAttrs = contactMatch ? this.parseAttributes(contactMatch[1]) : {}

      const groupMatch = xml.match(/<__group\s+([^>]*)\/>/)
      const groupAttrs = groupMatch ? this.parseAttributes(groupMatch[1]) : {}

      const remarksMatch = xml.match(/<remarks[^>]*>([\s\S]*?)<\/remarks>/)

      return {
        uid: attrs.uid || '',
        type: attrs.type || '',
        time: attrs.time || '',
        start: attrs.start || '',
        stale: attrs.stale || '',
        how: attrs.how || 'h-e',
        latitude: parseFloat(pointAttrs.lat || '0'),
        longitude: parseFloat(pointAttrs.lon || '0'),
        altitude: parseFloat(pointAttrs.hae || '0'),
        callsign: contactAttrs.callsign || null,
        remarks: remarksMatch?.[1]?.trim() || null,
        team: groupAttrs.name || null,
        role: groupAttrs.role || null,
      }
    } catch (err) {
      logger.warn({ err, xmlLength: xml.length }, 'Failed to parse CoT event')
      return null
    }
  }

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

  /**
   * Generate a CoT PLI XML event from position data.
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
    const now = new Date()
    const stale = new Date(now.getTime() + 120000) // 2 minutes stale
    const time = now.toISOString()

    const groupTag = input.team
      ? `<__group name="${this.escapeXml(input.team)}" role="${this.escapeXml(input.role || 'Team Member')}"/>`
      : ''

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<event version="2.0" uid="${this.escapeXml(input.uid)}" type="a-f-G-U-C"`,
      `  time="${time}" start="${time}" stale="${stale.toISOString()}" how="m-g">`,
      `  <point lat="${input.latitude}" lon="${input.longitude}"`,
      `    hae="${input.altitude || 0}" ce="35.0" le="999999"/>`,
      `  <detail>`,
      `    <contact callsign="${this.escapeXml(input.callsign)}"/>`,
      groupTag ? `    ${groupTag}` : '',
      `    <precisionlocation altsrc="GPS"/>`,
      `    <track course="0" speed="0"/>`,
      `  </detail>`,
      `</event>`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  /**
   * Generate a CoT alert event for an incident declaration.
   */
  generateAlert(input: {
    uid: string
    name: string
    type: string
    latitude: number
    longitude: number
    remarks?: string
  }): string {
    const now = new Date()
    const stale = new Date(now.getTime() + 3600000) // 1 hour stale
    const time = now.toISOString()

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<event version="2.0" uid="${this.escapeXml(input.uid)}" type="b-r-f-h-c"`,
      `  time="${time}" start="${time}" stale="${stale.toISOString()}" how="h-e">`,
      `  <point lat="${input.latitude}" lon="${input.longitude}" hae="0" ce="999999" le="999999"/>`,
      `  <detail>`,
      `    <contact callsign="${this.escapeXml(input.name)}"/>`,
      `    <remarks>${this.escapeXml(input.remarks || `Incident: ${input.name} (${input.type})`)}</remarks>`,
      `  </detail>`,
      `</event>`,
    ].join('\n')
  }

  private parseAttributes(attrString: string): Record<string, string> {
    const attrs: Record<string, string> = {}
    const regex = /(\w+)="([^"]*)"/g
    let match
    while ((match = regex.exec(attrString)) !== null) {
      attrs[match[1]] = match[2]
    }
    return attrs
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
}
