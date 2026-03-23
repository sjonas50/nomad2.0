import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import EmbeddingService from '#services/embedding_service'
import VectorStoreService from '#services/vector_store_service'
import OllamaService from '#services/ollama_service'

const searchKnowledgeBase: ToolHandler = {
  name: 'search_knowledge_base',
  displayName: 'Search Knowledge Base',
  description: 'Search the local knowledge base for relevant documents and information',
  category: 'knowledge',
  parameters: [
    { name: 'query', type: 'string', description: 'Search query', required: true },
    { name: 'limit', type: 'number', description: 'Max results to return', required: false, default: 5 },
  ],
  minimumRole: 'viewer',
  requiresConfirmation: false,

  async execute(params: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const query = params.query as string
    const limit = (params.limit as number) || 5

    try {
      const ollama = new OllamaService()
      const embedding = new EmbeddingService(ollama)
      const vectorStore = new VectorStoreService()

      const queryVector = await embedding.embedQuery(query)
      const results = await vectorStore.search(queryVector, undefined, limit)

      const documents = results.map((r) => ({
        content: (r.payload?.content as string)?.slice(0, 500),
        source: r.payload?.source,
        score: r.score,
      }))

      return {
        success: true,
        message: `Found ${documents.length} results for "${query}"`,
        data: { documents, query },
      }
    } catch (error) {
      return {
        success: false,
        message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  },
}

export default searchKnowledgeBase
