import { useState, useCallback, useRef } from 'react'

interface StreamMessage {
  token: string
  done: boolean
}

interface UseStreamOptions {
  url: string
  onToken?: (token: string) => void
  onDone?: () => void
  onError?: (error: Error) => void
}

interface UseStreamReturn {
  content: string
  isStreaming: boolean
  error: Error | null
  start: () => Promise<void>
  abort: () => void
}

/**
 * Custom hook for consuming ndjson streams from AdonisJS.
 * Bypasses Inertia's data layer — uses fetch + ReadableStream directly.
 */
export function useStream({ url, onToken, onDone, onError }: UseStreamOptions): UseStreamReturn {
  const [content, setContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsStreaming(false)
  }, [])

  const start = useCallback(async () => {
    abort()
    setContent('')
    setError(null)
    setIsStreaming(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch(url, { signal: controller.signal })

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.status}`)
      }

      const reader = response.body?.getReader()
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
          const msg: StreamMessage = JSON.parse(line)
          if (msg.done) {
            onDone?.()
          } else {
            setContent((prev) => prev + msg.token)
            onToken?.(msg.token)
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err)
        onError?.(err)
      }
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [url, onToken, onDone, onError, abort])

  return { content, isStreaming, error, start, abort }
}
