import type { HttpContext } from '@adonisjs/core/http'
import AIChatOrchestrator from '#services/ai_chat_orchestrator'
import ChatSession from '#models/chat_session'

export default class ChatController {
  /**
   * Stream a chat response via ndjson ReadableStream.
   * POST /api/chat
   */
  async stream({ request, response, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const { message, sessionId } = request.only(['message', 'sessionId'])

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return response.badRequest({ error: 'Message is required' })
    }

    const orchestrator = new AIChatOrchestrator()
    const stream = await orchestrator.processChat({
      message: message.trim(),
      sessionId: sessionId ? Number(sessionId) : undefined,
      userId: user.id,
      userRole: user.role,
    })

    response.header('Content-Type', 'application/x-ndjson')
    response.header('Cache-Control', 'no-cache')
    response.header('X-Accel-Buffering', 'no')
    return response.stream(stream)
  }

  /**
   * List chat sessions for the current user.
   * GET /api/sessions
   */
  async sessions({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const sessions = await ChatSession.query()
      .where('userId', user.id)
      .orderBy('updatedAt', 'desc')
      .limit(50)

    return sessions.map((s) => ({
      id: s.id,
      title: s.title || 'New Chat',
      modelName: s.modelName,
      updatedAt: s.updatedAt?.toISO(),
    }))
  }

  /**
   * Get messages for a specific session.
   * GET /api/sessions/:id/messages
   */
  async messages({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const session = await ChatSession.query()
      .where('id', params.id)
      .where('userId', user.id)
      .preload('messages')
      .firstOrFail()

    return session.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      thinkingContent: m.thinkingContent,
      sources: m.sources,
      createdAt: m.createdAt?.toISO(),
    }))
  }

  /**
   * Delete a chat session.
   * DELETE /api/sessions/:id
   */
  async deleteSession({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const session = await ChatSession.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()

    await session.delete()
    return response.noContent()
  }
}
