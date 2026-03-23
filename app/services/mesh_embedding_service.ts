import logger from '@adonisjs/core/services/logger'
import MeshService from '#services/mesh_service'
import EmbeddingService from '#services/embedding_service'
import VectorStoreService from '#services/vector_store_service'
import OllamaService from '#services/ollama_service'
import type MeshMessage from '#models/mesh_message'

export default class MeshEmbeddingService {
  private meshService: MeshService
  private embeddingService: EmbeddingService
  private vectorStore: VectorStoreService

  constructor(
    meshService?: MeshService,
    embeddingService?: EmbeddingService,
    vectorStore?: VectorStoreService
  ) {
    this.meshService = meshService ?? new MeshService()
    const ollama = new OllamaService()
    this.embeddingService = embeddingService ?? new EmbeddingService(ollama)
    this.vectorStore = vectorStore ?? new VectorStoreService()
  }

  /**
   * Embed un-embedded mesh messages into the vector store.
   * Returns the number of messages embedded.
   */
  async embedPendingMessages(batchSize: number = 50): Promise<number> {
    const messages = await this.meshService.getUnembeddedMessages(batchSize)
    if (messages.length === 0) return 0

    logger.info({ count: messages.length }, 'Embedding mesh messages')

    const texts = messages
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => this.formatForEmbedding(m))

    if (texts.length === 0) {
      // Mark as embedded even if no valid text (e.g., empty messages)
      await this.meshService.markAsEmbedded(messages.map((m) => m.id))
      return 0
    }

    try {
      const vectors = await this.embeddingService.embedDocuments(texts)

      // Upsert into vector store
      const points = vectors.map((vector, i) => {
        const msg = messages[i]
        return {
          id: `mesh_${msg.packetId}`,
          vector,
          payload: {
            content: texts[i],
            source: `mesh:${msg.channel}`,
            content_type: 'mesh_message',
            source_id: msg.packetId,
            from_node: msg.fromNode,
            channel: msg.channel,
            created_at: msg.receivedAt?.toISO(),
          },
        }
      })

      await this.vectorStore.upsert(points as any)
      await this.meshService.markAsEmbedded(messages.map((m) => m.id))

      logger.info({ embedded: texts.length }, 'Mesh messages embedded successfully')
      return texts.length
    } catch (error) {
      logger.error({ error }, 'Failed to embed mesh messages')
      return 0
    }
  }

  /**
   * Format a mesh message for embedding with metadata context.
   */
  private formatForEmbedding(message: MeshMessage): string {
    const parts: string[] = []
    parts.push(`[Mesh message from ${message.fromNode}`)
    if (message.channel !== 'default') {
      parts.push(` on channel ${message.channel}`)
    }
    if (message.receivedAt) {
      parts.push(` at ${message.receivedAt.toFormat('yyyy-MM-dd HH:mm')}`)
    }
    parts.push('] ')
    parts.push(message.content || '')
    return parts.join('')
  }
}
