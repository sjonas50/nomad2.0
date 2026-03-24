import { useState, useEffect } from 'react'
import { apiFetch } from '~/lib/fetch'

interface SyncPeer {
  id: string
  name: string
  host: string
  port: number
  lastSyncAt: string | null
  pendingOps: number
  online: boolean
}

interface BundleItem {
  filename: string
  sizeBytes: number
  createdAt: string
}

export default function SyncStatus() {
  const [peers, setPeers] = useState<SyncPeer[]>([])
  const [bundles, setBundles] = useState<BundleItem[]>([])
  const [stateHash, setStateHash] = useState('')
  const [exporting, setExporting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/sync/status')
      if (res.ok) {
        const data = await res.json()
        setPeers(data.peers || [])
        setStateHash(data.stateHash || '')
      }
    } catch { /* offline is expected */ }
  }

  const fetchBundles = async () => {
    try {
      const res = await fetch('/api/sync/bundles')
      if (res.ok) {
        const data = await res.json()
        setBundles(data.bundles || [])
      }
    } catch { /* */ }
  }

  useEffect(() => {
    fetchStatus()
    fetchBundles()
  }, [])

  const exportBundle = async (incidentId?: number) => {
    setExporting(true)
    setMessage(null)
    try {
      const res = await apiFetch('/api/sync/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentId }),
      })
      if (res.ok) {
        const data = await res.json()
        const sizeMB = (data.sizeBytes / (1024 * 1024)).toFixed(2)
        setMessage(`Bundle exported: ${data.filename} (${sizeMB} MB)`)
        fetchBundles()
      } else {
        const err = await res.json().catch(() => ({ error: 'Export failed' }))
        setMessage(`Error: ${err.error}`)
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Export failed'}`)
    } finally {
      setExporting(false)
    }
  }

  const importBundle = async (file: File) => {
    setMessage(null)
    const formData = new FormData()
    formData.append('bundle', file)
    try {
      const res = await apiFetch('/api/sync/import', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setMessage(`Imported from ${data.manifest.nodeId}: ${data.applied.join(', ')} applied`)
        fetchBundles()
        fetchStatus()
      } else {
        const err = await res.json().catch(() => ({ error: 'Import failed' }))
        setMessage(`Error: ${err.error}`)
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Import failed'}`)
    }
  }

  const scanPeers = async () => {
    setScanning(true)
    try {
      const res = await fetch('/api/sync/peers')
      if (res.ok) {
        const data = await res.json()
        setPeers(data.peers || [])
      }
    } catch { /* */ }
    setScanning(false)
  }

  const deleteBundle = async (filename: string) => {
    await apiFetch(`/api/sync/bundles/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    fetchBundles()
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      {/* State Hash */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-zinc-500">State Hash:</span>
        <code className="rounded-lg bg-surface-900 border border-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-400">{stateHash || '...'}</code>
      </div>

      {message && (
        <div className={`rounded-lg px-3 py-2 text-sm ${
          message.startsWith('Error')
            ? 'bg-red-500/10 border border-red-500/20 text-red-400'
            : 'bg-green-500/10 border border-green-500/20 text-green-400'
        }`}>
          {message}
        </div>
      )}

      {/* Export / Import */}
      <div className="flex gap-3">
        <button
          onClick={() => exportBundle()}
          disabled={exporting}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {exporting ? 'Exporting...' : 'Export Full Bundle'}
        </button>
        <label className="cursor-pointer rounded-lg border border-zinc-700 bg-surface-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
          Import Bundle
          <input
            type="file"
            accept=".attic"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) importBundle(file)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {/* Peers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-zinc-200">Discovered Peers</h4>
          <button
            onClick={scanPeers}
            disabled={scanning}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            {scanning ? 'Scanning...' : 'Scan Network'}
          </button>
        </div>
        {peers.length === 0 ? (
          <p className="text-sm text-zinc-500">No peers discovered. Connect to a shared network and scan.</p>
        ) : (
          <div className="space-y-1">
            {peers.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-surface-800 px-3 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${p.online ? 'bg-green-500' : 'bg-zinc-600'}`} />
                  <span className="font-medium text-zinc-200">{p.name}</span>
                  <span className="text-zinc-600">{p.host}:{p.port}</span>
                </div>
                <span className="text-xs text-zinc-600">
                  {p.lastSyncAt ? `Last sync: ${new Date(p.lastSyncAt).toLocaleString()}` : 'Never synced'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bundles */}
      <div>
        <h4 className="text-sm font-medium text-zinc-200 mb-2">Bundle History</h4>
        {bundles.length === 0 ? (
          <p className="text-sm text-zinc-500">No bundles yet. Export one to get started.</p>
        ) : (
          <div className="space-y-1">
            {bundles.map((b) => (
              <div key={b.filename} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-surface-800 px-3 py-2.5 text-sm">
                <div>
                  <span className="font-mono text-xs text-zinc-300">{b.filename}</span>
                  <span className="ml-2 text-zinc-600">{formatSize(b.sizeBytes)}</span>
                </div>
                <div className="flex gap-3">
                  <a
                    href={`/api/sync/download/${encodeURIComponent(b.filename)}`}
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    Download
                  </a>
                  <button
                    onClick={() => deleteBundle(b.filename)}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
