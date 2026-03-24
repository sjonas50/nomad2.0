import { Head } from '@inertiajs/react'
import { useRef, useEffect, useState, useCallback } from 'react'
import AppLayout from '~/layouts/app_layout'
import { useChat } from '~/hooks/use_chat'
import { MessageBubble } from '~/components/chat/message_bubble'
import { ChatInput } from '~/components/chat/chat_input'
import { SessionSidebar } from '~/components/chat/session_sidebar'

export default function Home() {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleSessionCreated = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  const { messages, isLoading, error, sessionId, send, stop, clearMessages, loadSession } =
    useChat({
      onSessionCreated: handleSessionCreated,
    })

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleNewChat = useCallback(() => {
    clearMessages()
  }, [clearMessages])

  const handleSelectSession = useCallback(
    (id: number) => {
      loadSession(id)
    },
    [loadSession]
  )

  return (
    <AppLayout>
      <Head title="Chat" />
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Session sidebar */}
        <SessionSidebar
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          refreshTrigger={refreshTrigger}
        />

        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <img src="/images/logo.png" alt="The Attic AI" className="h-20 w-20 mx-auto mb-4 opacity-60" />
                  <h1 className="text-2xl font-semibold text-white mb-1">The Attic AI</h1>
                  <p className="text-sm text-zinc-500">Ask anything about your knowledge base, incidents, or operations</p>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    thinkingContent={msg.thinkingContent}
                    sources={msg.sources}
                    isStreaming={msg.isStreaming}
                  />
                ))}
                {error && (
                  <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                    {error}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <ChatInput onSend={send} onStop={stop} isLoading={isLoading} />
        </div>
      </div>
    </AppLayout>
  )
}
