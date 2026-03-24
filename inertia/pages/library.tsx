import { Head } from '@inertiajs/react'
import { useState, useMemo, useEffect } from 'react'
import AppLayout from '~/layouts/app_layout'
import { apiFetch } from '~/lib/fetch'

interface AvailableItem {
  id: string
  name: string
  description: string
  url: string
  sizeMb: number
  category: string
  type: string
  tags: string[]
}

interface ContentPack {
  id: string
  name: string
  description: string
  icon: string
  color: string
  items: string[]
  totalSizeMb: number
}

interface InstalledItem {
  id: number
  name: string
  resourceType: string
  status: string
  fileSize: number
  ragEnabled: boolean
}

interface Props {
  available: AvailableItem[]
  packs: ContentPack[]
  installed: InstalledItem[]
}

const STATUS_COLORS: Record<string, string> = {
  downloading: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30',
  installed: 'bg-green-500/15 text-green-400 ring-1 ring-green-500/30',
  embedding: 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30',
  ready: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30',
}

const PACK_COLORS: Record<string, string> = {
  red: 'from-red-500/15 to-red-900/5 border-red-500/20',
  amber: 'from-amber-500/15 to-amber-900/5 border-amber-500/20',
  blue: 'from-brand-500/15 to-brand-900/5 border-brand-500/20',
  green: 'from-green-500/15 to-green-900/5 border-green-500/20',
  slate: 'from-zinc-500/15 to-zinc-900/5 border-zinc-500/20',
  purple: 'from-purple-500/15 to-purple-900/5 border-purple-500/20',
}

const PACK_ICON_COLORS: Record<string, string> = {
  red: 'text-red-400',
  amber: 'text-amber-400',
  blue: 'text-brand-400',
  green: 'text-green-400',
  slate: 'text-zinc-400',
  purple: 'text-purple-400',
}

type Tab = 'packs' | 'knowledge' | 'maps' | 'installed'

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(0)} MB`
}

export default function Library({ available, packs, installed: initialInstalled }: Props) {
  const [installed, setInstalled] = useState(initialInstalled)
  const [downloading, setDownloading] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>('packs')
  const [expandedPack, setExpandedPack] = useState<string | null>(null)

  const knowledgeItems = useMemo(
    () => available.filter((a) => a.category !== 'Maps'),
    [available]
  )

  const mapItems = useMemo(
    () => available.filter((a) => a.category === 'Maps'),
    [available]
  )

  const [downloadError, setDownloadError] = useState<string | null>(null)

  const handleDownload = async (item: AvailableItem) => {
    setDownloadError(null)
    setDownloading((prev) => new Set(prev).add(item.id))
    try {
      const res = await apiFetch('/api/library/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url, name: item.name, type: item.type }),
      })
      if (res.ok) {
        const data = await res.json()
        setInstalled((prev) => [
          { id: data.id, name: data.name, resourceType: item.type, status: 'downloading', fileSize: 0, ragEnabled: false },
          ...prev,
        ])
      } else {
        const body = await res.json().catch(() => null)
        setDownloadError(body?.error || `Download failed (${res.status})`)
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Network error')
    }
    setDownloading((prev) => { const n = new Set(prev); n.delete(item.id); return n })
  }

  const handlePackDownload = async (pack: ContentPack) => {
    for (const itemId of pack.items) {
      const item = available.find((a) => a.id === itemId)
      if (item && !downloading.has(item.id)) {
        await handleDownload(item)
      }
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/library/${id}`, { method: 'DELETE' })
      setInstalled((prev) => prev.filter((r) => r.id !== id))
    } catch { /* */ }
  }

  return (
    <AppLayout>
      <Head title="Content Library" />
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Content Library</h1>
            <p className="text-sm text-zinc-500 mt-1">Download offline knowledge, maps, and reference materials</p>
          </div>
          {installed.length > 0 && (
            <span className="text-xs text-zinc-500 bg-surface-800 px-3 py-1.5 rounded-full border border-zinc-800">
              {installed.length} installed
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-surface-800 p-1 rounded-xl border border-zinc-800 w-fit">
          {([
            { key: 'packs', label: 'Packs', count: packs.length },
            { key: 'knowledge', label: 'Knowledge', count: knowledgeItems.length },
            { key: 'maps', label: 'Maps', count: mapItems.length },
            { key: 'installed', label: 'Installed', count: installed.length },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
                tab === t.key
                  ? 'bg-brand-500 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
              {t.count > 0 && <span className="ml-1.5 text-xs opacity-60">{t.count}</span>}
            </button>
          ))}
        </div>

        {downloadError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-between">
            <span className="text-sm text-red-400">{downloadError}</span>
            <button onClick={() => setDownloadError(null)} className="text-red-400 hover:text-red-300 text-xs ml-3">Dismiss</button>
          </div>
        )}

        {/* ═══ Packs Tab ═══ */}
        {tab === 'packs' && (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400 mb-4">
              Pre-built bundles for common scenarios. Install a pack to download all its content at once.
            </p>
            {packs.map((pack) => {
              const isExpanded = expandedPack === pack.id
              const packItems = pack.items
                .map((id) => available.find((a) => a.id === id))
                .filter(Boolean) as AvailableItem[]
              return (
                <div
                  key={pack.id}
                  className={`rounded-xl border bg-gradient-to-br transition-all ${PACK_COLORS[pack.color] || PACK_COLORS.blue}`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${PACK_ICON_COLORS[pack.color] || 'text-brand-400'}`}>
                          <PackIcon name={pack.icon} />
                        </div>
                        <div>
                          <h3 className="text-white font-semibold">{pack.name}</h3>
                          <p className="text-sm text-zinc-400 mt-0.5">{pack.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                            <span>{pack.items.length} items</span>
                            <span>{formatSize(pack.totalSizeMb)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <button
                          onClick={() => setExpandedPack(isExpanded ? null : pack.id)}
                          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          {isExpanded ? 'Hide' : 'View'} items
                        </button>
                        <button
                          onClick={() => handlePackDownload(pack)}
                          className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Install Pack
                        </button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-white/5 px-5 py-3 space-y-1.5">
                      {packItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <TypeBadge type={item.type} />
                            <span className="text-sm text-zinc-300 truncate">{item.name}</span>
                            <span className="text-xs text-zinc-600">{formatSize(item.sizeMb)}</span>
                          </div>
                          <button
                            onClick={() => handleDownload(item)}
                            disabled={downloading.has(item.id)}
                            className="text-xs text-zinc-500 hover:text-white transition-colors disabled:opacity-40"
                          >
                            {downloading.has(item.id) ? 'Starting...' : 'Download'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ Knowledge Tab ═══ */}
        {tab === 'knowledge' && (
          <div className="space-y-2">
            {(['Emergency', 'Medical', 'Military', 'Technical', 'Homesteading', 'Reference'] as const).map((cat) => {
              const items = knowledgeItems.filter((i) => i.category === cat)
              if (items.length === 0) return null
              return (
                <div key={cat}>
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mt-4 mb-2">{cat}</h3>
                  {items.map((item) => (
                    <ContentCard
                      key={item.id}
                      item={item}
                      downloading={downloading.has(item.id)}
                      onDownload={() => handleDownload(item)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ Maps Tab ═══ */}
        {tab === 'maps' && <MapsTab />}

        {/* ═══ Installed Tab ═══ */}
        {tab === 'installed' && (
          <div>
            {installed.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-zinc-500">No content installed yet</p>
                <p className="text-sm text-zinc-600 mt-1">Browse packs or individual items to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {installed.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-4 bg-surface-800 rounded-xl border border-zinc-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <TypeBadge type={r.resourceType} />
                      <div className="min-w-0">
                        <span className="text-white text-sm truncate block">{r.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[r.status] || 'bg-zinc-700 text-zinc-400'}`}>
                            {r.status}
                          </span>
                          {r.fileSize > 0 && (
                            <span className="text-xs text-zinc-600">{formatSize(r.fileSize / (1024 * 1024))}</span>
                          )}
                          {r.ragEnabled && (
                            <span className="text-xs text-emerald-400">RAG</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors ml-2"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

/* ─── Shared Components ─── */

function ContentCard({
  item,
  downloading,
  onDownload,
  compact,
}: {
  item: AvailableItem
  downloading: boolean
  onDownload: () => void
  compact?: boolean
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-surface-800 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <TypeBadge type={item.type} />
        <div className="min-w-0">
          <div className="text-sm text-white font-medium">{item.name}</div>
          {!compact && <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{item.description}</div>}
          <div className="text-xs text-zinc-600 mt-1">{formatSize(item.sizeMb)}</div>
        </div>
      </div>
      <button
        onClick={onDownload}
        disabled={downloading}
        className="ml-3 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors shrink-0"
      >
        {downloading ? 'Starting...' : 'Download'}
      </button>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    zim: 'bg-blue-500/15 text-blue-400',
    pdf: 'bg-red-500/15 text-red-400',
    'osm.pbf': 'bg-green-500/15 text-green-400',
    pmtiles: 'bg-green-500/15 text-green-400',
  }
  const labels: Record<string, string> = {
    zim: 'ZIM',
    pdf: 'PDF',
    'osm.pbf': 'OSM',
    pmtiles: 'MAP',
  }
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase shrink-0 ${colors[type] || 'bg-zinc-700 text-zinc-400'}`}>
      {labels[type] || type}
    </span>
  )
}

interface RegionItem {
  id: string
  name: string
  group: 'state' | 'fema' | 'national' | 'territory'
  estimateMb: number
  downloaded: boolean
  sizeMb: number | null
  extracting: boolean
  progress: string | null
  error: string | null
}

function MapsTab() {
  const [regions, setRegions] = useState<RegionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [groupFilter, setGroupFilter] = useState<'all' | 'national' | 'fema' | 'state' | 'territory'>('all')
  const [extracting, setExtracting] = useState<Set<string>>(new Set())

  const fetchRegions = async () => {
    try {
      const res = await fetch('/api/map/regions')
      if (res.ok) {
        const data = await res.json()
        setRegions(data.regions)
      }
    } catch { /* offline */ }
    setLoading(false)
  }

  useEffect(() => {
    fetchRegions()
    const interval = setInterval(fetchRegions, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleExtract = async (regionId: string) => {
    setExtracting((prev) => new Set(prev).add(regionId))
    try {
      await apiFetch('/api/map/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regionId }),
      })
    } catch { /* */ }
    // Poll will update status
  }

  const handleDelete = async (regionId: string) => {
    try {
      await apiFetch(`/api/map/regions/${regionId}`, { method: 'DELETE' })
      fetchRegions()
    } catch { /* */ }
  }

  const filtered = regions.filter((r) => groupFilter === 'all' || r.group === groupFilter)
  const downloadedCount = regions.filter((r) => r.downloaded).length
  const extractingCount = regions.filter((r) => r.extracting).length

  const groups = [
    { key: 'all' as const, label: 'All' },
    { key: 'national' as const, label: 'National' },
    { key: 'fema' as const, label: 'FEMA Regions' },
    { key: 'state' as const, label: 'States' },
    { key: 'territory' as const, label: 'Territories' },
  ]

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="p-4 bg-surface-800 rounded-xl border border-zinc-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-white font-semibold mb-1">Offline Maps</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Download street-level vector maps for offline use. The{' '}
              <a href="/map" className="text-brand-400 hover:text-brand-300">Map page</a>{' '}
              uses OpenStreetMap online by default and will switch to offline tiles when available.
            </p>
          </div>
          <div className="text-right shrink-0">
            {downloadedCount > 0 && (
              <div className="text-sm text-green-400">{downloadedCount} downloaded</div>
            )}
            {extractingCount > 0 && (
              <div className="text-sm text-blue-400">{extractingCount} extracting</div>
            )}
          </div>
        </div>
      </div>

      {/* Group filter */}
      <div className="flex gap-1 bg-surface-800 p-1 rounded-xl border border-zinc-800 w-fit">
        {groups.map((g) => (
          <button
            key={g.key}
            onClick={() => setGroupFilter(g.key)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              groupFilter === g.key
                ? 'bg-brand-500 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Region list */}
      {loading ? (
        <div className="text-center py-8 text-zinc-500">Loading regions...</div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((r) => {
            const isExtracting = r.extracting || extracting.has(r.id)
            return (
              <div
                key={r.id}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                  r.downloaded
                    ? 'bg-green-500/5 border-green-500/15'
                    : isExtracting
                      ? 'bg-blue-500/5 border-blue-500/15'
                      : r.error
                        ? 'bg-red-500/5 border-red-500/15'
                        : 'bg-surface-800 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">{r.name}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                      r.group === 'fema' ? 'bg-amber-500/15 text-amber-400' :
                      r.group === 'national' ? 'bg-purple-500/15 text-purple-400' :
                      r.group === 'territory' ? 'bg-cyan-500/15 text-cyan-400' :
                      'bg-zinc-700 text-zinc-400'
                    }`}>
                      {r.group === 'fema' ? 'FEMA' : r.group === 'national' ? 'NAT' : r.group === 'territory' ? 'TERR' : r.id.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {r.downloaded ? (
                      <span className="text-green-400">Downloaded — {formatSize(r.sizeMb!)}</span>
                    ) : isExtracting ? (
                      <span className="text-blue-400">{r.progress || 'Extracting...'}</span>
                    ) : r.error ? (
                      <span className="text-red-400">{r.error}</span>
                    ) : (
                      <span>~{formatSize(r.estimateMb)} estimated</span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 ml-3">
                  {r.downloaded ? (
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="px-3 py-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  ) : isExtracting ? (
                    <div className="px-3 py-1.5 text-xs text-blue-400">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} strokeDasharray="32" strokeLinecap="round" />
                      </svg>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleExtract(r.id)}
                      className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload option */}
      <div className="p-4 bg-surface-800 rounded-xl border border-zinc-800">
        <h4 className="text-sm text-zinc-400 mb-2">Or upload a .pmtiles file</h4>
        <UploadPmtiles />
      </div>
    </div>
  )
}

function UploadPmtiles() {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ name: string; sizeMb: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.pmtiles')) {
      setError('File must be a .pmtiles file')
      return
    }
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiFetch('/api/map/tiles/upload', { method: 'POST', body: formData })
      if (res.ok) {
        setResult(await res.json())
      } else {
        const body = await res.json().catch(() => null)
        setError(body?.error || `Upload failed (${res.status})`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload error')
    }
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div>
      <label className="flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-zinc-500 transition-colors">
        <svg className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <span className="text-sm text-zinc-400">{uploading ? 'Uploading...' : 'Choose .pmtiles file'}</span>
        <input type="file" accept=".pmtiles" onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
      {result && (
        <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded text-sm text-green-400">
          Uploaded {result.name} ({formatSize(result.sizeMb)})
        </div>
      )}
      {error && (
        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">{error}</div>
      )}
    </div>
  )
}

function PackIcon({ name }: { name: string }) {
  const cls = "h-5 w-5"
  switch (name) {
    case 'shield':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    case 'compass':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
    case 'wrench':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    case 'leaf':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
    case 'target':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
    case 'book':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
    default:
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/></svg>
  }
}

