import logger from '@adonisjs/core/services/logger'

/**
 * SyncService bridges MySQL models ↔ Yjs CRDT documents.
 *
 * Design principles:
 * - Append-only logs merge naturally (union of sets)
 * - Status fields use last-writer-wins with timestamp tiebreaker
 * - MySQL is the authoritative store; Yjs is the transport layer
 *
 * Yjs document structure:
 *   incidents    → Y.Map<incidentId, Y.Map<field, value>>
 *   activity_logs → Y.Array<{id, incidentId, activity, source, ...}>
 *   personnel    → Y.Map<`${userId}-${incidentId}`, Y.Map<field, value>>
 *   resources    → Y.Map<resourceId, Y.Map<field, value>>
 *   functions    → Y.Map<functionId, Y.Map<field, value>>
 *   comm_trees   → Y.Map<treeId, Y.Map<field, value>>
 */

export interface SyncPeer {
  id: string
  name: string
  host: string
  port: number
  lastSyncAt: string | null
  pendingOps: number
  online: boolean
}

export interface SyncStatus {
  nodeId: string
  peers: SyncPeer[]
  lastExportAt: string | null
  lastImportAt: string | null
  pendingChanges: number
  yjsConnected: boolean
}

export default class SyncService {
  private nodeId: string

  constructor() {
    this.nodeId = process.env.NODE_ID || `attic-${Date.now().toString(36)}`
  }

  /**
   * Get the current sync status.
   */
  async getStatus(): Promise<SyncStatus> {
    return {
      nodeId: this.nodeId,
      peers: await this.getKnownPeers(),
      lastExportAt: null,
      lastImportAt: null,
      pendingChanges: 0,
      yjsConnected: false,
    }
  }

  /**
   * Get Redis client if available. Returns null if Redis is not reachable.
   */
  private async getRedis(): Promise<any | null> {
    try {
      const redis = (await import('@adonisjs/redis/services/main')).default
      await redis.ping()
      return redis
    } catch {
      return null
    }
  }

  /**
   * Get known peers from Redis cache.
   */
  async getKnownPeers(): Promise<SyncPeer[]> {
    const redis = await this.getRedis()
    if (!redis) return []

    try {
      const peersRaw = await redis.get('sync:peers')
      if (peersRaw) {
        return JSON.parse(peersRaw)
      }
    } catch {
      // Redis may not be available
    }
    return []
  }

  /**
   * Register a discovered peer.
   */
  async registerPeer(peer: Omit<SyncPeer, 'lastSyncAt' | 'pendingOps' | 'online'>): Promise<void> {
    const redis = await this.getRedis()
    if (!redis) return

    try {
      const peers = await this.getKnownPeers()
      const existing = peers.findIndex((p) => p.id === peer.id)

      const fullPeer: SyncPeer = {
        ...peer,
        lastSyncAt: null,
        pendingOps: 0,
        online: true,
      }

      if (existing >= 0) {
        peers[existing] = { ...peers[existing], ...peer, online: true }
      } else {
        peers.push(fullPeer)
      }

      await redis.set('sync:peers', JSON.stringify(peers))
      logger.info({ peerId: peer.id }, 'Peer registered')
    } catch (err) {
      logger.warn({ err }, 'Failed to register peer')
    }
  }

  /**
   * Record a sync event for a peer.
   */
  async recordSync(peerId: string): Promise<void> {
    const redis = await this.getRedis()
    if (!redis) return

    try {
      const peers = await this.getKnownPeers()
      const peer = peers.find((p) => p.id === peerId)
      if (peer) {
        peer.lastSyncAt = new Date().toISOString()
        peer.pendingOps = 0
        await redis.set('sync:peers', JSON.stringify(peers))
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to record sync')
    }
  }

  /**
   * Generate a compact sync hash (for mesh transport).
   * Returns a hash of the latest state vector for comparison.
   */
  async getStateHash(): Promise<string> {
    const { createHash } = await import('node:crypto')

    try {
      const Incident = (await import('#models/incident')).default
      const IcsActivityLog = (await import('#models/ics_activity_log')).default

      const latestIncident = await Incident.query().orderBy('updatedAt', 'desc').first()
      const latestLog = await IcsActivityLog.query().orderBy('loggedAt', 'desc').first()
      const logCount = await IcsActivityLog.query().count('* as total')

      const stateString = [
        latestIncident?.updatedAt?.toISO() || '0',
        latestLog?.loggedAt?.toISO() || '0',
        logCount[0]?.$extras?.total || 0,
      ].join('|')

      return createHash('sha256').update(stateString).digest('hex').slice(0, 16)
    } catch {
      // DB may not be available — return hash of current time as fallback
      return createHash('sha256').update(this.nodeId).digest('hex').slice(0, 16)
    }
  }

  /**
   * Compare state hashes to determine if sync is needed.
   */
  async needsSync(remoteHash: string): Promise<boolean> {
    const localHash = await this.getStateHash()
    return localHash !== remoteHash
  }
}
