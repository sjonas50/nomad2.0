import { Head } from '@inertiajs/react'
import { useState } from 'react'
import AppLayout from '~/layouts/app_layout'

interface AvailableItem {
  id: string
  name: string
  description: string
  sizeMb: number
  category: string
  type: string
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
  installed: InstalledItem[]
}

const STATUS_COLORS: Record<string, string> = {
  downloading: 'bg-blue-600',
  installed: 'bg-green-600',
  embedding: 'bg-purple-600',
  ready: 'bg-emerald-600',
  failed: 'bg-red-600',
}

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(0)} MB`
}

export default function Library({ available, installed: initialInstalled }: Props) {
  const [installed, setInstalled] = useState(initialInstalled)
  const [downloading, setDownloading] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string>('all')

  const categories = ['all', ...new Set(available.map((a) => a.category))]

  const filtered =
    filter === 'all' ? available : available.filter((a) => a.category === filter)

  const handleDownload = async (item: AvailableItem) => {
    setDownloading((prev) => new Set(prev).add(item.id))
    try {
      const res = await fetch('/api/library/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://download.kiwix.org/zim/${item.id}`,
          name: item.name,
          type: item.type,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setInstalled((prev) => [
          {
            id: data.id,
            name: data.name,
            resourceType: item.type,
            status: 'downloading',
            fileSize: 0,
            ragEnabled: false,
          },
          ...prev,
        ])
      }
    } catch {
      // ignore
    }
    setDownloading((prev) => {
      const next = new Set(prev)
      next.delete(item.id)
      return next
    })
  }

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/library/${id}`, { method: 'DELETE' })
      setInstalled((prev) => prev.filter((r) => r.id !== id))
    } catch {
      // ignore
    }
  }

  return (
    <AppLayout>
      <Head title="Content Library" />
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Content Library</h1>

        {/* Installed resources */}
        {installed.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-300 mb-3">Installed</h2>
            <div className="space-y-2">
              {installed.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg border border-zinc-700"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-white">{r.name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full text-white ${STATUS_COLORS[r.status] || 'bg-zinc-600'}`}>
                      {r.status}
                    </span>
                    <span className="text-xs text-zinc-500">{r.resourceType}</span>
                    {r.ragEnabled && (
                      <span className="text-xs text-emerald-400">RAG enabled</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="px-2 py-1 text-xs text-zinc-400 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available content */}
        <h2 className="text-lg font-semibold text-zinc-300 mb-3">Available Content</h2>

        {/* Category filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1 text-sm rounded-full ${
                filter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid gap-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-4 bg-zinc-800 rounded-lg border border-zinc-700"
            >
              <div className="flex-1">
                <div className="text-white font-medium">{item.name}</div>
                <div className="text-sm text-zinc-400 mt-0.5">{item.description}</div>
                <div className="text-xs text-zinc-500 mt-1 flex gap-3">
                  <span>{formatSize(item.sizeMb)}</span>
                  <span>{item.category}</span>
                  <span>{item.type}</span>
                </div>
              </div>
              <button
                onClick={() => handleDownload(item)}
                disabled={downloading.has(item.id)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50 ml-4"
              >
                {downloading.has(item.id) ? 'Starting...' : 'Download'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
