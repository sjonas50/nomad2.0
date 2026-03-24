import OllamaService from '#services/ollama_service'

const EMBEDDING_MODEL = 'nomic-embed-text'
/**
 * nomic-embed-text has a 2048-token context window.
 * Hard character ceiling: 4000 chars ≈ 1600 tokens at worst-case 2.5 chars/token.
 * This leaves ~400 tokens of headroom for the "search_document: " prefix and
 * edge-case content (tables, abbreviations, numbers) that tokenizes poorly.
 */
const MAX_INPUT_CHARS = 4000
const AGGRESSIVE_MAX_CHARS = 2000
const BATCH_SIZE = 16

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
   *
   * Falls back to one-at-a-time embedding if a batch fails, so a single
   * oversized chunk doesn't kill the entire ingestion.
   */
  async embedDocuments(
    texts: string[],
    onProgress?: (progress: EmbeddingProgress) => void
  ): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = []
    const total = texts.length

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE)
      const truncated = batch.map((t) => this.truncateToTokenLimit(t))
      const prefixed = truncated.map((t) => `search_document: ${t}`)

      try {
        const vectors = await this.ollama.embed(EMBEDDING_MODEL, prefixed)

        for (let j = 0; j < batch.length; j++) {
          results.push({
            text: batch[j],
            vector: vectors[j],
            index: i + j,
          })
        }
      } catch {
        // Batch failed — fall back to one-at-a-time to isolate the problem chunk
        for (let j = 0; j < batch.length; j++) {
          try {
            const vectors = await this.ollama.embed(EMBEDDING_MODEL, [prefixed[j]])
            results.push({ text: batch[j], vector: vectors[0], index: i + j })
          } catch {
            // Aggressively truncate this specific chunk and retry once more
            const aggressive = this.aggressiveTruncate(batch[j])
            try {
              const vectors = await this.ollama.embed(EMBEDDING_MODEL, [
                `search_document: ${aggressive}`,
              ])
              results.push({ text: batch[j], vector: vectors[0], index: i + j })
            } catch {
              // Skip this chunk entirely — better to lose one chunk than fail the whole doc
            }
          }
        }
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
   * Hard character ceiling truncation.
   * 4000 chars guarantees ≤1600 tokens even at worst-case 2.5 chars/token,
   * well under nomic-embed-text's 2048-token context.
   */
  private truncateToTokenLimit(text: string): string {
    if (text.length <= MAX_INPUT_CHARS) {
      return text
    }
    return text.slice(0, MAX_INPUT_CHARS)
  }

  /**
   * Last-resort truncation at half the normal limit.
   */
  private aggressiveTruncate(text: string): string {
    return text.slice(0, AGGRESSIVE_MAX_CHARS)
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
