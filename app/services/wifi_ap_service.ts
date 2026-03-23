import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import logger from '@adonisjs/core/services/logger'

const execAsync = promisify(exec)

export interface WifiApConfig {
  ssid: string
  password?: string
  channel: number
  interface: string
  captivePortalEnabled: boolean
}

export interface WifiApStatus {
  active: boolean
  ssid: string | null
  connectedClients: number
  interface: string | null
}

const DEFAULT_CONFIG: WifiApConfig = {
  ssid: 'The Attic AI',
  channel: 6,
  interface: 'wlan0',
  captivePortalEnabled: true,
}

export default class WifiApService {
  private config: WifiApConfig

  constructor(config?: Partial<WifiApConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  getConfig(): WifiApConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<WifiApConfig>): WifiApConfig {
    this.config = { ...this.config, ...updates }
    return this.getConfig()
  }

  /**
   * Check if the WiFi AP is currently active.
   */
  async getStatus(): Promise<WifiApStatus> {
    try {
      const { stdout } = await execAsync('hostapd_cli status 2>/dev/null || echo "inactive"')
      const active = stdout.includes('state=ENABLED')

      let connectedClients = 0
      if (active) {
        try {
          const { stdout: stationsOut } = await execAsync('hostapd_cli all_sta 2>/dev/null')
          connectedClients = (stationsOut.match(/dot11RSNAStatsSTAAddress/g) || []).length
        } catch {
          // ignore
        }
      }

      return {
        active,
        ssid: active ? this.config.ssid : null,
        connectedClients,
        interface: this.config.interface,
      }
    } catch {
      return {
        active: false,
        ssid: null,
        connectedClients: 0,
        interface: this.config.interface,
      }
    }
  }

  /**
   * Generate hostapd configuration file content.
   */
  generateHostapdConfig(): string {
    const lines = [
      `interface=${this.config.interface}`,
      'driver=nl80211',
      `ssid=${this.config.ssid}`,
      'hw_mode=g',
      `channel=${this.config.channel}`,
      'wmm_enabled=0',
      'macaddr_acl=0',
      'auth_algs=1',
      'ignore_broadcast_ssid=0',
    ]

    if (this.config.password && this.config.password.length >= 8) {
      lines.push('wpa=2', `wpa_passphrase=${this.config.password}`, 'wpa_key_mgmt=WPA-PSK', 'rsn_pairwise=CCMP')
    }

    return lines.join('\n') + '\n'
  }

  /**
   * Generate dnsmasq configuration for DHCP and captive portal.
   */
  generateDnsmasqConfig(gatewayIp: string = '192.168.4.1'): string {
    const lines = [
      `interface=${this.config.interface}`,
      `dhcp-range=192.168.4.10,192.168.4.200,255.255.255.0,24h`,
      `address=/#/${gatewayIp}`,
    ]

    if (this.config.captivePortalEnabled) {
      // Redirect all DNS to gateway for captive portal
      lines.push(`dhcp-option=6,${gatewayIp}`)
    }

    return lines.join('\n') + '\n'
  }

  /**
   * Start the WiFi access point.
   */
  async start(): Promise<boolean> {
    try {
      const hostapdConf = this.generateHostapdConfig()
      const confPath = '/tmp/attic-hostapd.conf'
      await writeFile(confPath, hostapdConf)

      // Configure interface
      await execAsync(`sudo ip addr add 192.168.4.1/24 dev ${this.config.interface} 2>/dev/null || true`)
      await execAsync(`sudo ip link set ${this.config.interface} up`)

      // Start hostapd
      await execAsync(`sudo hostapd -B ${confPath}`)

      // Start dnsmasq
      const dnsmasqConf = this.generateDnsmasqConfig()
      const dnsmasqPath = '/tmp/attic-dnsmasq.conf'
      await writeFile(dnsmasqPath, dnsmasqConf)
      await execAsync(`sudo dnsmasq -C ${dnsmasqPath} --pid-file=/tmp/attic-dnsmasq.pid`)

      logger.info({ ssid: this.config.ssid }, 'WiFi AP started')
      return true
    } catch (error) {
      logger.error({ error }, 'Failed to start WiFi AP')
      return false
    }
  }

  /**
   * Stop the WiFi access point.
   */
  async stop(): Promise<boolean> {
    try {
      await execAsync('sudo killall hostapd 2>/dev/null || true')
      await execAsync('sudo kill $(cat /tmp/attic-dnsmasq.pid) 2>/dev/null || true')
      await execAsync(`sudo ip addr del 192.168.4.1/24 dev ${this.config.interface} 2>/dev/null || true`)
      logger.info('WiFi AP stopped')
      return true
    } catch (error) {
      logger.error({ error }, 'Failed to stop WiFi AP')
      return false
    }
  }

  /**
   * Generate a WiFi QR code string (WIFI:S:ssid;T:WPA;P:password;;).
   */
  generateQrString(): string {
    const auth = this.config.password ? 'WPA' : 'nopass'
    const pass = this.config.password ? `P:${this.config.password};` : ''
    return `WIFI:S:${this.config.ssid};T:${auth};${pass};`
  }

  /**
   * Check if WiFi AP capabilities are available on this system.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('which hostapd')
      await execAsync('which dnsmasq')
      return true
    } catch {
      return false
    }
  }
}
