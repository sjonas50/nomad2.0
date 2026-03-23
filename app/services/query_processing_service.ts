import OllamaService from '#services/ollama_service'

const REWRITE_MODEL = 'qwen2.5:1.5b'

interface ProcessedQuery {
  original: string
  rewritten: string
  expansions: string[]
}

export default class QueryProcessingService {
  private ollama: OllamaService

  constructor(ollama?: OllamaService) {
    this.ollama = ollama ?? new OllamaService()
  }

  /**
   * Process a user query: rewrite for clarity and generate search expansions.
   */
  async process(query: string): Promise<ProcessedQuery> {
    const [rewritten, expansions] = await Promise.all([
      this.rewriteQuery(query),
      this.generateExpansions(query),
    ])

    return {
      original: query,
      rewritten,
      expansions,
    }
  }

  /**
   * Rewrite the query for better retrieval.
   * Falls back to the original query on error.
   */
  private async rewriteQuery(query: string): Promise<string> {
    try {
      const result = await this.ollama.chat(REWRITE_MODEL, [
        {
          role: 'system',
          content:
            'Rewrite the following search query to be more specific and effective for document retrieval. Keep it concise (under 50 words). Output ONLY the rewritten query.',
        },
        { role: 'user', content: query },
      ])
      const rewritten = result.trim()
      return rewritten.length > 0 ? rewritten : query
    } catch {
      return query
    }
  }

  /**
   * Generate 2-3 alternative phrasings to improve recall.
   * Falls back to empty array on error.
   */
  private async generateExpansions(query: string): Promise<string[]> {
    try {
      const result = await this.ollama.chat(REWRITE_MODEL, [
        {
          role: 'system',
          content:
            'Generate 2-3 alternative search queries for the following question. Output one query per line, nothing else.',
        },
        { role: 'user', content: query },
      ])
      return result
        .split('\n')
        .map((l) => l.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter((l) => l.length > 0)
        .slice(0, 3)
    } catch {
      return []
    }
  }
}
