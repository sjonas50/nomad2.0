import { Head } from '@inertiajs/react'
import { useState, useRef } from 'react'
import AppLayout from '~/layouts/app_layout'

interface Source {
  id: number
  name: string
  sourceType: string
  status: string
  chunkCount: number
  fileSize: number
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
}

interface Props {
  sources: Source[]
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-600',
  extracting: 'bg-blue-600',
  chunking: 'bg-blue-600',
  embedding: 'bg-blue-600',
  entity_extracting: 'bg-purple-600',
  completed: 'bg-green-600',
  failed: 'bg-red-600',
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function Knowledge({ sources }: Props) {
  const [items, setItems] = useState<Source[]>(sources)
  const [isUploading, setIsUploading] = useState(false)
  const [showTextForm, setShowTextForm] = useState(false)
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        setItems((prev) => [
          { ...data, sourceType: 'upload', chunkCount: 0, fileSize: file.size, errorMessage: null, createdAt: new Date().toISOString(), completedAt: null },
          ...prev,
        ])
      }
    } catch {
      // ignore
    }
    setIsUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleTextSubmit = async () => {
    if (!textTitle.trim() || !textContent.trim()) return

    try {
      const res = await fetch('/api/knowledge/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: textTitle, content: textContent }),
      })
      if (res.ok) {
        const data = await res.json()
        setItems((prev) => [
          { ...data, sourceType: 'text', chunkCount: 0, fileSize: textContent.length, errorMessage: null, createdAt: new Date().toISOString(), completedAt: null },
          ...prev,
        ])
        setTextTitle('')
        setTextContent('')
        setShowTextForm(false)
      }
    } catch {
      // ignore
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/knowledge/${id}`, { method: 'DELETE' })
      setItems((prev) => prev.filter((s) => s.id !== id))
    } catch {
      // ignore
    }
  }

  const handleReEmbed = async (id: number) => {
    try {
      await fetch(`/api/knowledge/${id}/re-embed`, { method: 'POST' })
      setItems((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: 'pending', chunkCount: 0 } : s))
      )
    } catch {
      // ignore
    }
  }

  return (
    <AppLayout>
      <Head title="Knowledge Base" />
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTextForm(!showTextForm)}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm"
            >
              + Add Text
            </button>
            <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm cursor-pointer">
              {isUploading ? 'Uploading...' : '+ Upload File'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.html,.csv,.json"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>
          </div>
        </div>

        {/* Text input form */}
        {showTextForm && (
          <div className="mb-6 p-4 bg-zinc-800 rounded-lg border border-zinc-700">
            <input
              type="text"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
              placeholder="Title"
              className="w-full mb-2 px-3 py-2 bg-zinc-900 text-white border border-zinc-600 rounded-lg"
            />
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="Paste your text content here..."
              rows={6}
              className="w-full mb-2 px-3 py-2 bg-zinc-900 text-white border border-zinc-600 rounded-lg resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowTextForm(false)}
                className="px-3 py-1.5 text-zinc-400 hover:text-white text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleTextSubmit}
                disabled={!textTitle.trim() || !textContent.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                Ingest
              </button>
            </div>
          </div>
        )}

        {/* Sources table */}
        {items.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <p className="text-lg">No knowledge sources yet</p>
            <p className="text-sm mt-1">Upload a file or paste text to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between p-4 bg-zinc-800 rounded-lg border border-zinc-700"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{source.name}</span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full text-white ${STATUS_COLORS[source.status] || 'bg-zinc-600'}`}
                    >
                      {source.status}
                    </span>
                    <span className="text-xs text-zinc-500">{source.sourceType}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 flex gap-3">
                    <span>{formatBytes(source.fileSize)}</span>
                    {source.chunkCount > 0 && <span>{source.chunkCount} chunks</span>}
                    {source.errorMessage && (
                      <span className="text-red-400" title={source.errorMessage}>
                        Error: {source.errorMessage.slice(0, 50)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 ml-4">
                  {source.status === 'completed' && (
                    <button
                      onClick={() => handleReEmbed(source.id)}
                      className="px-2 py-1 text-xs text-zinc-400 hover:text-blue-400"
                      title="Re-embed"
                    >
                      Re-embed
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(source.id)}
                    className="px-2 py-1 text-xs text-zinc-400 hover:text-red-400"
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
