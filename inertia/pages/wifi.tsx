import { Head } from '@inertiajs/react'
import { useState } from 'react'
import AppLayout from '~/layouts/app_layout'

interface WifiStatus {
  active: boolean
  ssid: string | null
  connectedClients: number
  interface: string | null
}

interface WifiConfig {
  ssid: string
  channel: number
  interface: string
  captivePortalEnabled: boolean
  hasPassword: boolean
}

interface Props {
  available: boolean
  status: WifiStatus
  config: WifiConfig
  qrString: string
}

export default function Wifi({ available, status: initialStatus, config: initialConfig, qrString }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [ssid, setSsid] = useState(initialConfig.ssid)
  const [password, setPassword] = useState('')
  const [channel, setChannel] = useState(initialConfig.channel)
  const [loading, setLoading] = useState(false)

  const refreshStatus = async () => {
    try {
      const res = await fetch('/api/wifi/status')
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
  }

  const handleStart = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/wifi/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid, password: password || undefined, channel }),
      })
      if (res.ok) await refreshStatus()
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      await fetch('/api/wifi/stop', { method: 'POST' })
      await refreshStatus()
    } catch { /* ignore */ }
    setLoading(false)
  }

  if (!available) {
    return (
      <AppLayout>
        <Head title="WiFi Access Point" />
        <div className="p-6 max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">WiFi Access Point</h1>
          <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-300">
            WiFi AP is not available. Install <code>hostapd</code> and <code>dnsmasq</code> to enable.
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <Head title="WiFi Access Point" />
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">WiFi Access Point</h1>

        {/* Status */}
        <div className={`mb-6 p-4 rounded-lg border ${status.active ? 'bg-green-900/20 border-green-700' : 'bg-zinc-800 border-zinc-700'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${status.active ? 'bg-green-500' : 'bg-zinc-600'}`} />
                <span className="text-white font-medium">
                  {status.active ? `Active: ${status.ssid}` : 'Inactive'}
                </span>
              </div>
              {status.active && (
                <div className="text-xs text-zinc-400 mt-1">
                  {status.connectedClients} client(s) connected on {status.interface}
                </div>
              )}
            </div>
            <button
              onClick={status.active ? handleStop : handleStart}
              disabled={loading}
              className={`px-4 py-2 rounded text-sm text-white disabled:opacity-50 ${
                status.active
                  ? 'bg-red-700 hover:bg-red-600'
                  : 'bg-green-700 hover:bg-green-600'
              }`}
            >
              {loading ? '...' : status.active ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 mb-6">
          <h2 className="text-lg font-semibold text-zinc-300 mb-4">Configuration</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">SSID</label>
              <input
                type="text"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Password (optional, 8+ chars)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty for open network"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Channel</label>
              <select
                value={channel}
                onChange={(e) => setChannel(Number(e.target.value))}
                className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white text-sm"
              >
                {[1, 6, 11].map((ch) => (
                  <option key={ch} value={ch}>Channel {ch}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* QR Code */}
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4">
          <h2 className="text-lg font-semibold text-zinc-300 mb-2">Connect via QR</h2>
          <p className="text-sm text-zinc-400 mb-3">
            Scan this with a phone to connect to the network:
          </p>
          <code className="block p-3 bg-black rounded text-xs text-zinc-300 break-all">
            {qrString}
          </code>
        </div>
      </div>
    </AppLayout>
  )
}
