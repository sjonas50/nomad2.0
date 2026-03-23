import type { HttpContext } from '@adonisjs/core/http'
import MeshService from '#services/mesh_service'
import MeshSummaryService from '#services/mesh_summary_service'
import MeshEmbeddingService from '#services/mesh_embedding_service'

export default class MeshController {
  /**
   * Show the mesh message board page.
   * GET /mesh
   */
  async index({ inertia }: HttpContext) {
    const mesh = new MeshService()
    const enabled = mesh.isEnabled()

    let messages: Awaited<ReturnType<MeshService['getMessages']>> = []
    let nodes: Awaited<ReturnType<MeshService['getNodes']>> = []
    let channels: string[] = []

    if (enabled) {
      try {
        messages = await mesh.getMessages({ limit: 50 })
        nodes = await mesh.getNodes()
        channels = await mesh.getChannels()
      } catch {
        // DB may not be available
      }
    }

    return inertia.render('mesh' as any, {
      enabled,
      messages: messages.map((m) => ({
        id: m.id,
        packetId: m.packetId,
        fromNode: m.fromNode,
        toNode: m.toNode,
        channel: m.channel,
        portNum: m.portNum,
        content: m.content,
        receivedAt: m.receivedAt?.toISO(),
      })),
      nodes: nodes.map((n) => ({
        id: n.id,
        nodeId: n.nodeId,
        longName: n.longName,
        shortName: n.shortName,
        hardwareModel: n.hardwareModel,
        batteryLevel: n.batteryLevel,
        snr: n.snr,
        isOnline: n.isOnline,
        lastHeardAt: n.lastHeardAt?.toISO(),
        latitude: n.latitude,
        longitude: n.longitude,
      })),
      channels,
    })
  }

  /**
   * Get messages for a channel.
   * GET /api/mesh/messages
   */
  async messages({ request }: HttpContext) {
    const mesh = new MeshService()
    const channel = request.qs().channel as string | undefined
    const limit = Number(request.qs().limit) || 50
    const offset = Number(request.qs().offset) || 0

    const messages = await mesh.getMessages({ channel, limit, offset })
    return messages.map((m) => ({
      id: m.id,
      packetId: m.packetId,
      fromNode: m.fromNode,
      channel: m.channel,
      content: m.content,
      receivedAt: m.receivedAt?.toISO(),
    }))
  }

  /**
   * Get online nodes.
   * GET /api/mesh/nodes
   */
  async nodes(_ctx: HttpContext) {
    const mesh = new MeshService()
    const nodes = await mesh.getNodes()
    return nodes.map((n) => ({
      nodeId: n.nodeId,
      longName: n.longName,
      shortName: n.shortName,
      hardwareModel: n.hardwareModel,
      batteryLevel: n.batteryLevel,
      isOnline: n.isOnline,
      lastHeardAt: n.lastHeardAt?.toISO(),
    }))
  }

  /**
   * Generate a summary of recent mesh traffic.
   * GET /api/mesh/summary
   */
  async summary({ request }: HttpContext) {
    const hours = Number(request.qs().hours) || 1
    const channel = request.qs().channel as string | undefined

    const summaryService = new MeshSummaryService()
    const text = channel
      ? await summaryService.summarizeChannel(channel, hours)
      : await summaryService.summarizeRecent(hours)

    return { summary: text }
  }

  /**
   * Trigger embedding of pending mesh messages.
   * POST /api/mesh/embed
   */
  async embed(_ctx: HttpContext) {
    const embedService = new MeshEmbeddingService()
    const count = await embedService.embedPendingMessages()
    return { embedded: count }
  }
}
