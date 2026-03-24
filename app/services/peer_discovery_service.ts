import logger from '@adonisjs/core/services/logger'
import SyncService from '#services/sync_service'

/**
 * Discovers other Attic AI instances on the local network via mDNS.
 * Uses dns-sd (macOS built-in) to browse for _attic._tcp services.
 */

export interface DiscoveredPeer {
  id: string
  name: string
  host: string
  port: number
}

export default class PeerDiscoveryService {
  private syncService: SyncService
  private scanning = false

  constructor() {
    this.syncService = new SyncService()
  }

  /**
   * Scan the local network for Attic instances.
   * Uses dns-sd on macOS (built-in, no extra deps).
   */
  async scanOnce(): Promise<DiscoveredPeer[]> {
    if (this.scanning) return []
    this.scanning = true

    try {
      const { execFile } = await import('node:child_process')
      const { promisify } = await import('node:util')
      const execFileAsync = promisify(execFile)

      // dns-sd -B _attic._tcp scans for 2 seconds
      const { stdout } = await execFileAsync('dns-sd', ['-B', '_attic._tcp', 'local.'], {
        timeout: 3000,
      }).catch(() => ({ stdout: '' }))

      const peers: DiscoveredPeer[] = []
      const lines = stdout.split('\n').filter((l) => l.includes('_attic._tcp'))

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const name = parts[parts.length - 1]
        if (name) {
          peers.push({
            id: name,
            name,
            host: `${name}.local`,
            port: 3333,
          })
        }
      }

      // Register discovered peers
      for (const peer of peers) {
        await this.syncService.registerPeer(peer)
      }

      return peers
    } catch (err) {
      logger.warn({ err }, 'Peer discovery scan failed')
      return []
    } finally {
      this.scanning = false
    }
  }

  /**
   * Register this instance as a discoverable service.
   * Uses dns-sd to advertise on mDNS.
   */
  async advertise(): Promise<void> {
    try {
      const nodeId = process.env.NODE_ID || 'attic-node'
      const port = process.env.PORT || '3333'

      const { spawn } = await import('node:child_process')
      const proc = spawn('dns-sd', ['-R', nodeId, '_attic._tcp', 'local.', port], {
        stdio: 'ignore',
        detached: true,
      })
      proc.unref()

      logger.info({ nodeId, port }, 'mDNS advertisement started')
    } catch (err) {
      logger.warn({ err }, 'mDNS advertisement failed — peer discovery will be manual only')
    }
  }
}
