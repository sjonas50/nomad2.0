import { useEffect, useState } from 'react'
import { apiFetch } from '~/lib/fetch'

interface Session {
  id: number
  title: string
  modelName: string
  updatedAt: string
}

interface SessionSidebarProps {
  currentSessionId: number | null
  onSelectSession: (sessionId: number) => void
  onNewChat: () => void
  refreshTrigger?: number
}

export function SessionSidebar({
  currentSessionId,
  onSelectSession,
  onNewChat,
  refreshTrigger,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const loadSessions = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/sessions')
      if (res.ok) {
        setSessions(await res.json())
      }
    } catch {
      // Silently fail
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadSessions()
  }, [refreshTrigger])

  const handleDelete = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation()
    try {
      await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      if (currentSessionId === sessionId) {
        onNewChat()
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="w-64 bg-surface-900 border-r border-zinc-800 flex flex-col h-full">
      <div className="p-3 border-b border-zinc-800">
        <button
          onClick={onNewChat}
          className="w-full px-3 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 rounded-lg text-sm font-medium border border-brand-500/20 transition-colors"
        >
          + New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && sessions.length === 0 && (
          <div className="p-3 text-zinc-500 text-sm">Loading...</div>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`group flex items-center justify-between px-3 py-2 mx-2 my-1 rounded-lg cursor-pointer text-sm transition-colors ${
              currentSessionId === session.id
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <span className="truncate flex-1">{session.title}</span>
            <button
              onClick={(e) => handleDelete(e, session.id)}
              className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 ml-2 transition-opacity"
              title="Delete session"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
