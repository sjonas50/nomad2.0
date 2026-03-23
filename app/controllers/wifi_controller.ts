import type { HttpContext } from '@adonisjs/core/http'
import WifiApService from '#services/wifi_ap_service'

export default class WifiController {
  /**
   * Show the WiFi AP configuration page.
   * GET /wifi
   */
  async index({ inertia }: HttpContext) {
    const wifi = new WifiApService()
    const available = await wifi.isAvailable()
    const status = await wifi.getStatus()
    const config = wifi.getConfig()
    const qrString = wifi.generateQrString()

    return inertia.render('wifi' as any, {
      available,
      status,
      config: {
        ssid: config.ssid,
        channel: config.channel,
        interface: config.interface,
        captivePortalEnabled: config.captivePortalEnabled,
        hasPassword: !!config.password,
      },
      qrString,
    })
  }

  /**
   * Get current AP status.
   * GET /api/wifi/status
   */
  async status(_ctx: HttpContext) {
    const wifi = new WifiApService()
    return wifi.getStatus()
  }

  /**
   * Start the WiFi AP.
   * POST /api/wifi/start
   */
  async start({ request, response }: HttpContext) {
    const { ssid, password, channel } = request.only(['ssid', 'password', 'channel'])
    const wifi = new WifiApService({
      ssid: ssid || undefined,
      password: password || undefined,
      channel: channel ? Number(channel) : undefined,
    })

    const started = await wifi.start()
    if (!started) {
      return response.internalServerError({ error: 'Failed to start WiFi AP' })
    }
    return response.ok({ status: 'started', qrString: wifi.generateQrString() })
  }

  /**
   * Stop the WiFi AP.
   * POST /api/wifi/stop
   */
  async stop({ response }: HttpContext) {
    const wifi = new WifiApService()
    const stopped = await wifi.stop()
    if (!stopped) {
      return response.internalServerError({ error: 'Failed to stop WiFi AP' })
    }
    return response.ok({ status: 'stopped' })
  }
}
