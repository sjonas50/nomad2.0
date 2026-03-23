import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import MeshNode from '#models/mesh_node'
import MeshMessage from '#models/mesh_message'

export interface MeshtasticPacket {
  id: string
  from: string
  to?: string
  channel?: string
  portnum: string
  payload: {
    text?: string
    position?: { latitude: number; longitude: number; altitude?: number }
    telemetry?: { batteryLevel?: number; voltage?: number }
    nodeInfo?: { longName?: string; shortName?: string; hwModel?: string }
  }
  snr?: number
  rxTime?: number
}

export interface MeshConfig {
  mqttBroker: string
  mqttTopic: string
  mqttUsername?: string
  mqttPassword?: string
  enabled: boolean
}

const DEFAULT_MESH_CONFIG: MeshConfig = {
  mqttBroker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
  mqttTopic: process.env.MQTT_TOPIC || 'msh/+/2/json/#',
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,
  enabled: process.env.MESH_ENABLED === 'true',
}

// Prompt injection sanitization patterns
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /<<SYS>>/i,
]

export default class MeshService {
  private config: MeshConfig
  private connected: boolean = false

  constructor(config?: Partial<MeshConfig>) {
    this.config = { ...DEFAULT_MESH_CONFIG, ...config }
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  isConnected(): boolean {
    return this.connected
  }

  getConfig(): MeshConfig {
    return { ...this.config }
  }

  /**
   * Process an incoming Meshtastic packet (from MQTT or serial).
   */
  async processPacket(packet: MeshtasticPacket): Promise<void> {
    logger.debug({ packetId: packet.id, from: packet.from, portnum: packet.portnum }, 'Processing mesh packet')

    // Update node info
    await this.upsertNode(packet)

    // Handle message types
    switch (packet.portnum) {
      case 'TEXT_MESSAGE_APP':
        await this.handleTextMessage(packet)
        break
      case 'POSITION_APP':
        await this.handlePositionUpdate(packet)
        break
      case 'TELEMETRY_APP':
        await this.handleTelemetry(packet)
        break
      case 'NODEINFO_APP':
        await this.handleNodeInfo(packet)
        break
      default:
        // Store raw packet for other types
        await this.storeMessage(packet)
    }
  }

  /**
   * Get recent messages, optionally filtered by channel.
   */
  async getMessages(options: {
    channel?: string
    limit?: number
    offset?: number
  } = {}): Promise<MeshMessage[]> {
    const query = MeshMessage.query().orderBy('receivedAt', 'desc')
    if (options.channel) query.where('channel', options.channel)
    if (options.limit) query.limit(options.limit)
    if (options.offset) query.offset(options.offset)
    return query
  }

  /**
   * Get all known nodes.
   */
  async getNodes(): Promise<MeshNode[]> {
    return MeshNode.query().orderBy('lastHeardAt', 'desc')
  }

  /**
   * Get online nodes (heard in the last 15 minutes).
   */
  async getOnlineNodes(): Promise<MeshNode[]> {
    const cutoff = DateTime.now().minus({ minutes: 15 })
    return MeshNode.query()
      .where('lastHeardAt', '>=', cutoff.toSQL()!)
      .orderBy('lastHeardAt', 'desc')
  }

  /**
   * Get distinct channels from messages.
   */
  async getChannels(): Promise<string[]> {
    const results = await MeshMessage.query()
      .distinct('channel')
      .orderBy('channel', 'asc')
    return results.map((r) => r.channel)
  }

  /**
   * Get un-embedded messages for RAG ingestion.
   */
  async getUnembeddedMessages(limit: number = 50): Promise<MeshMessage[]> {
    return MeshMessage.query()
      .where('isEmbedded', false)
      .whereNotNull('content')
      .where('portNum', 'TEXT_MESSAGE_APP')
      .orderBy('receivedAt', 'asc')
      .limit(limit)
  }

  /**
   * Mark messages as embedded.
   */
  async markAsEmbedded(ids: number[]): Promise<void> {
    if (ids.length === 0) return
    await MeshMessage.query().whereIn('id', ids).update({ isEmbedded: true })
  }

  /**
   * Sanitize mesh message content against prompt injection.
   */
  sanitizeContent(content: string): string {
    let sanitized = content.trim()

    for (const pattern of INJECTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[filtered]')
    }

    // Truncate excessively long messages
    if (sanitized.length > 500) {
      sanitized = sanitized.slice(0, 500) + '...'
    }

    return sanitized
  }

  private async upsertNode(packet: MeshtasticPacket): Promise<void> {
    try {
      let node = await MeshNode.query().where('nodeId', packet.from).first()
      if (!node) {
        node = await MeshNode.create({
          nodeId: packet.from,
          isOnline: true,
          lastHeardAt: DateTime.now(),
        })
      } else {
        node.isOnline = true
        node.lastHeardAt = DateTime.now()
        if (packet.snr !== undefined) node.snr = packet.snr
        await node.save()
      }
    } catch (error) {
      logger.error({ error, nodeId: packet.from }, 'Failed to upsert mesh node')
    }
  }

  private async handleTextMessage(packet: MeshtasticPacket): Promise<void> {
    const content = packet.payload.text
    if (!content) return

    const sanitized = this.sanitizeContent(content)
    await this.storeMessage(packet, sanitized)
  }

  private async handlePositionUpdate(packet: MeshtasticPacket): Promise<void> {
    const pos = packet.payload.position
    if (!pos) return

    try {
      const node = await MeshNode.query().where('nodeId', packet.from).first()
      if (node) {
        node.latitude = pos.latitude
        node.longitude = pos.longitude
        if (pos.altitude) node.altitude = pos.altitude
        await node.save()
      }
    } catch (error) {
      logger.error({ error }, 'Failed to update node position')
    }
  }

  private async handleTelemetry(packet: MeshtasticPacket): Promise<void> {
    const telemetry = packet.payload.telemetry
    if (!telemetry) return

    try {
      const node = await MeshNode.query().where('nodeId', packet.from).first()
      if (node && telemetry.batteryLevel !== undefined) {
        node.batteryLevel = telemetry.batteryLevel
        await node.save()
      }
    } catch (error) {
      logger.error({ error }, 'Failed to update node telemetry')
    }
  }

  private async handleNodeInfo(packet: MeshtasticPacket): Promise<void> {
    const info = packet.payload.nodeInfo
    if (!info) return

    try {
      const node = await MeshNode.query().where('nodeId', packet.from).first()
      if (node) {
        if (info.longName) node.longName = info.longName
        if (info.shortName) node.shortName = info.shortName
        if (info.hwModel) node.hardwareModel = info.hwModel
        await node.save()
      }
    } catch (error) {
      logger.error({ error }, 'Failed to update node info')
    }
  }

  private async storeMessage(packet: MeshtasticPacket, content?: string): Promise<void> {
    try {
      await MeshMessage.create({
        packetId: packet.id,
        fromNode: packet.from,
        toNode: packet.to || null,
        channel: packet.channel || 'default',
        portNum: packet.portnum,
        content: content || null,
        rawPayload: packet.payload as Record<string, unknown>,
        isEmbedded: false,
        receivedAt: packet.rxTime
          ? DateTime.fromSeconds(packet.rxTime)
          : DateTime.now(),
      })
    } catch (error) {
      // Duplicate packet_id is expected (MQTT can redeliver)
      if (!(error instanceof Error && error.message.includes('Duplicate'))) {
        logger.error({ error, packetId: packet.id }, 'Failed to store mesh message')
      }
    }
  }
}
