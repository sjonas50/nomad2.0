import type { HttpContext } from '@adonisjs/core/http'
import RetrievalFeedback from '#models/retrieval_feedback'
import ChatMessage from '#models/chat_message'

export default class FeedbackController {
  /**
   * Submit feedback for a chat message.
   * POST /api/feedback
   */
  async create({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const { messageId, rating, comment } = request.only(['messageId', 'rating', 'comment'])

    if (!messageId || !rating || !['positive', 'negative'].includes(rating)) {
      return response.badRequest({ error: 'messageId and rating (positive/negative) are required' })
    }

    // Verify message belongs to user's session
    const message = await ChatMessage.query()
      .where('id', messageId)
      .preload('chatSession')
      .firstOrFail()

    if ((message.chatSession as any)?.userId !== user.id) {
      return response.forbidden({ error: 'Cannot provide feedback on this message' })
    }

    // Extract source IDs from message metadata
    const sourceIds = message.sources
      ? (message.sources as Array<{ id: string }>).map((s) => String(s.id))
      : null

    const feedback = await RetrievalFeedback.updateOrCreate(
      { userId: user.id, chatMessageId: messageId },
      { rating, comment: comment || null, sourceIds }
    )

    return { id: feedback.id, rating: feedback.rating }
  }

  /**
   * Get feedback stats for admin.
   * GET /api/admin/feedback/stats
   */
  async stats(_ctx: HttpContext) {
    const positive = await RetrievalFeedback.query().where('rating', 'positive').count('* as total')
    const negative = await RetrievalFeedback.query().where('rating', 'negative').count('* as total')

    return {
      positive: Number((positive[0] as any).$extras.total),
      negative: Number((negative[0] as any).$extras.total),
      total: Number((positive[0] as any).$extras.total) + Number((negative[0] as any).$extras.total),
    }
  }
}
