import { Socket } from 'node:net'
import CoTService from '#services/cot_service'
import PositionService from '#services/position_service'
import ICSService from '#services/ics_service'
import logger from '@adonisjs/core/services/logger'

/**
 * Listens to an OpenTAKServer CoT TCP feed and processes incoming events.
 * Updates mesh_nodes positions and creates activity log entries for GeoChat messages.
 */
export default class CoTListener {
  private socket: Socket | null = null
  private cotService: CoTService
  private positionService: PositionService
  private icsService: ICSService
  private buffer = ''
  private connected = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    this.cotService = new CoTService()
    this.positionService = new PositionService()
    this.icsService = new ICSService()
  }

  /**
   * Connect to the OpenTAKServer CoT TCP feed.
   */
  connect(host?: string, port?: number): void {
    const takHost = host || process.env.TAK_COT_HOST || '127.0.0.1'
    const takPort = port || Number(process.env.TAK_COT_PORT || 8089)

    if (this.socket) {
      this.disconnect()
    }

    this.socket = new Socket()

    this.socket.on('connect', () => {
      this.connected = true
      logger.info({ host: takHost, port: takPort }, 'Connected to TAK CoT feed')
    })

    this.socket.on('data', (data) => {
      this.buffer += data.toString()
      this.processBuffer()
    })

    this.socket.on('error', (err) => {
      logger.warn({ err }, 'TAK CoT connection error')
      this.connected = false
    })

    this.socket.on('close', () => {
      this.connected = false
      logger.info('TAK CoT connection closed')
      this.scheduleReconnect(takHost, takPort)
    })

    this.socket.connect(takPort, takHost)
  }

  /**
   * Disconnect from the CoT feed.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this.connected = false
    this.buffer = ''
  }

  /**
   * Check if currently connected.
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * Send a CoT XML event to the TAK server.
   */
  send(xml: string): boolean {
    if (!this.socket || !this.connected) return false
    this.socket.write(xml)
    return true
  }

  private scheduleReconnect(host: string, port: number): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      logger.info('Attempting TAK CoT reconnection...')
      this.connect(host, port)
    }, 10000) // Reconnect after 10 seconds
  }

  private processBuffer(): void {
    // CoT events are delimited by </event>
    let endIdx: number
    while ((endIdx = this.buffer.indexOf('</event>')) !== -1) {
      const eventEnd = endIdx + '</event>'.length
      const xml = this.buffer.slice(0, eventEnd).trim()
      this.buffer = this.buffer.slice(eventEnd)

      if (xml.includes('<event')) {
        this.handleEvent(xml).catch((err) => {
          logger.warn({ err }, 'Failed to handle CoT event')
        })
      }
    }

    // Prevent buffer from growing unbounded
    if (this.buffer.length > 100000) {
      this.buffer = this.buffer.slice(-50000)
    }
  }

  private async handleEvent(xml: string): Promise<void> {
    const event = this.cotService.parseEvent(xml)
    if (!event) return

    // Handle PLI (position updates)
    if (this.cotService.isPLI(event)) {
      const pli = this.cotService.extractPLI(event)
      if (pli) {
        await this.positionService.updatePosition({
          nodeId: `tak-${pli.uid}`,
          latitude: pli.latitude,
          longitude: pli.longitude,
          altitude: pli.altitude,
          callsign: pli.callsign,
          source: 'tak',
        })
      }
    }

    // Handle GeoChat (activity log entries)
    if (this.cotService.isGeoChat(event)) {
      const chat = this.cotService.extractGeoChat(event)
      if (chat && chat.message) {
        const incident = await this.icsService.getActiveIncident()
        if (incident) {
          await this.icsService.logActivity({
            incidentId: incident.id,
            activity: `[TAK GeoChat from ${chat.sender}] ${chat.message}`,
            source: 'mesh', // TAK messages treated as mesh-like communication
            category: 'communication',
          })
        }
      }
    }
  }
}
