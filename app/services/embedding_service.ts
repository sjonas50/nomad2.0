import OllamaService from '#services/ollama_service'

const EMBEDDING_MODEL = 'nomic-embed-text'
const MAX_TOKENS_PER_CHUNK = 1800
const BATCH_SIZE = 32

interface EmbeddingResult {
  text: string
  vector: number[]
  index: number
}

interface EmbeddingProgress {
  completed: number
  total: number
  percent: number
}

export default class EmbeddingService {
  private ollama: OllamaService

  constructor(ollama?: OllamaService) {
    this.ollama = ollama ?? new OllamaService()
  }

  /**
   * Embed a single text with the search_document prefix.
   */
  async embedDocument(text: string): Promise<number[]> {
    const prefixed = `search_document: ${text}`
    const results = await this.ollama.embed(EMBEDDING_MODEL, [prefixed])
    return results[0]
  }

  /**
   * Embed a query with the search_query prefix.
   */
  async embedQuery(query: string): Promise<number[]> {
    const prefixed = `search_query: ${query}`
    const results = await this.ollama.embed(EMBEDDING_MODEL, [prefixed])
    return results[0]
  }

  /**
   * Batch embed documents with progress tracking.
   * Enforces 1800-token ceiling by truncating oversized texts.
   * Uses search_document: prefix for all texts.
   */
  async embedDocuments(
    texts: string[],
    onProgress?: (progress: EmbeddingProgress) => void
  ): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = []
    const total = texts.length

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE)
      const prefixed = batch.map((t) => `search_document: ${this.truncateToTokenLimit(t)}`)

      const vectors = await this.ollama.embed(EMBEDDING_MODEL, prefixed)

      for (let j = 0; j < batch.length; j++) {
        results.push({
          text: batch[j],
          vector: vectors[j],
          index: i + j,
        })
      }

      if (onProgress) {
        const completed = Math.min(i + BATCH_SIZE, total)
        onProgress({
          completed,
          total,
          percent: Math.round((completed / total) * 100),
        })
      }
    }

    return results
  }

  /**
   * Rough token estimation: ~4 chars per token for English text.
   * Truncates text to stay under the 1800-token ceiling.
   */
  private truncateToTokenLimit(text: string): string {
    const estimatedTokens = Math.ceil(text.length / 4)
    if (estimatedTokens <= MAX_TOKENS_PER_CHUNK) {
      return text
    }
    return text.slice(0, MAX_TOKENS_PER_CHUNK * 4)
  }

  /**
   * Check if the embedding model is available.
   */
  async ensureModel(): Promise<boolean> {
    try {
      const models = await this.ollama.listModels()
      return models.some((m) => m.name.startsWith(EMBEDDING_MODEL))
    } catch {
      return false
    }
  }
}
