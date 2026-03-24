import { useState } from 'react'

interface Source {
  id: string
  score: number
  source?: string
  title?: string
}

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  thinkingContent?: string
  sources?: Source[]
  isStreaming?: boolean
}

export function MessageBubble({
  role,
  content,
  thinkingContent,
  sources,
  isStreaming,
}: MessageBubbleProps) {
  const [showThinking, setShowThinking] = useState(false)

  const isUser = role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-brand-500 text-white'
            : 'bg-surface-800 text-zinc-100 border border-zinc-800'
        }`}
      >
        {/* Thinking toggle */}
        {thinkingContent && (
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="text-xs text-zinc-400 hover:text-zinc-300 mb-2 flex items-center gap-1"
          >
            <span>{showThinking ? '▾' : '▸'}</span>
            <span>Thinking</span>
          </button>
        )}
        {showThinking && thinkingContent && (
          <div className="text-xs text-zinc-400 mb-2 p-2 bg-zinc-900 rounded border border-zinc-700 whitespace-pre-wrap">
            {thinkingContent}
          </div>
        )}

        {/* Message content */}
        <div className="whitespace-pre-wrap break-words">{content}</div>

        {/* Streaming indicator */}
        {isStreaming && !content && (
          <div className="flex gap-1 py-1">
            <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}

        {/* Sources */}
        {sources && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-zinc-600">
            <div className="text-xs text-zinc-400 mb-1">Sources:</div>
            <div className="flex flex-wrap gap-1">
              {sources.map((s, i) => (
                <span
                  key={s.id}
                  className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded"
                  title={`Score: ${s.score.toFixed(3)}`}
                >
                  [{i + 1}] {s.title || s.source || 'Source'}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
