import { useState, useRef, useCallback } from 'react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinkingContent?: string
  sources?: Array<{
    id: string
    score: number
    source?: string
    title?: string
  }>
  isStreaming?: boolean
}

interface UseChatOptions {
  sessionId?: number
  onSessionCreated?: (sessionId: number, title?: string) => void
  onError?: (error: string) => void
}

interface UseChatReturn {
  messages: ChatMessage[]
  isLoading: boolean
  error: string | null
  sessionId: number | null
  send: (message: string) => void
  stop: () => void
  clearMessages: () => void
  loadSession: (sessionId: number) => Promise<void>
}

let msgCounter = 0
function nextId() {
  return `msg-${Date.now()}-${++msgCounter}`
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(options.sessionId ?? null)
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(
    (message: string) => {
      if (!message.trim() || isLoading) return

      setError(null)
      setIsLoading(true)

      // Add user message immediately
      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: message,
      }
      setMessages((prev) => [...prev, userMsg])

      // Create placeholder for assistant response
      const assistantId = nextId()
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      }
      setMessages((prev) => [...prev, assistantMsg])

      const controller = new AbortController()
      abortRef.current = controller

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`)
          }

          const reader = res.body?.getReader()
          if (!reader) throw new Error('No response body')

          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const chunk = JSON.parse(line)
                handleChunk(chunk, assistantId)
              } catch {
                // Skip malformed lines
              }
            }
          }

          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const chunk = JSON.parse(buffer)
              handleChunk(chunk, assistantId)
            } catch {
              // ignore
            }
          }

          // Mark streaming complete
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
          )
          setIsLoading(false)
        })
        .catch((err) => {
          if (err.name === 'AbortError') {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
            )
          } else {
            const errMsg = err.message || 'Failed to send message'
            setError(errMsg)
            options.onError?.(errMsg)
            // Remove empty assistant message on error
            setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content))
          }
          setIsLoading(false)
        })

      function handleChunk(
        chunk: { type: string; content: string; metadata?: Record<string, unknown> },
        asstId: string
      ) {
        switch (chunk.type) {
          case 'token':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === asstId ? { ...m, content: m.content + chunk.content } : m
              )
            )
            break
          case 'thinking':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === asstId
                  ? { ...m, thinkingContent: (m.thinkingContent || '') + chunk.content }
                  : m
              )
            )
            break
          case 'sources':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === asstId
                  ? {
                      ...m,
                      sources: chunk.metadata?.sources as ChatMessage['sources'],
                    }
                  : m
              )
            )
            break
          case 'session': {
            const sid = chunk.metadata?.sessionId as number
            if (sid) {
              setSessionId(sid)
              options.onSessionCreated?.(sid, chunk.metadata?.title as string)
            }
            break
          }
          case 'error':
            setError(chunk.content)
            options.onError?.(chunk.content)
            break
          case 'done':
            break
        }
      }
    },
    [isLoading, sessionId, options]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsLoading(false)
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSessionId(null)
    setError(null)
  }, [])

  const loadSession = useCallback(async (loadSessionId: number) => {
    try {
      const res = await fetch(`/api/sessions/${loadSessionId}/messages`)
      if (!res.ok) throw new Error('Failed to load session')
      const data = await res.json()
      setMessages(
        data.map((m: { id: number; role: string; content: string; thinkingContent?: string; sources?: unknown }) => ({
          id: `loaded-${m.id}`,
          role: m.role,
          content: m.content,
          thinkingContent: m.thinkingContent,
          sources: m.sources,
        }))
      )
      setSessionId(loadSessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    }
  }, [])

  return { messages, isLoading, error, sessionId, send, stop, clearMessages, loadSession }
}
