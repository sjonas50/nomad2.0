import EmbeddingService from '#services/embedding_service'
import VectorStoreService from '#services/vector_store_service'
import GraphService from '#services/graph_service'
import QueryProcessingService from '#services/query_processing_service'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

interface RetrievalResult {
  id: string
  content: string
  score: number
  source: string
  title?: string
  heading?: string
  sourceType?: string
}

interface RetrievalOptions {
  limit?: number
  filter?: Record<string, unknown>
  enableQueryRewriting?: boolean
  enableGraphRetrieval?: boolean
}

export default class RetrievalService {
  private embedding: EmbeddingService
  private vectorStore: VectorStoreService
  private graphService: GraphService
  private queryProcessor: QueryProcessingService

  constructor() {
    this.embedding = new EmbeddingService()
    this.vectorStore = new VectorStoreService()
    this.graphService = new GraphService()
    this.queryProcessor = new QueryProcessingService()
  }

  /**
   * Hybrid retrieval: Vector search + Graph traversal + RRF fusion.
   *
   * Pipeline:
   * 1. (optional) Rewrite query for better retrieval
   * 2. Embed query → vector search (top-40)
   * 3. (optional) Graph entity lookup → expand neighbors
   * 4. RRF fusion → deduplicate → top-N results
   */
  async retrieve(query: string, options: RetrievalOptions = {}): Promise<RetrievalResult[]> {
    const limit = options.limit ?? 5
    const enableGraph =
      options.enableGraphRetrieval !== false && env.get('FALKORDB_ENABLED', false)

    // Step 1: Query processing
    let searchQuery = query
    if (options.enableQueryRewriting !== false) {
      try {
        const processed = await this.queryProcessor.process(query)
        searchQuery = processed.rewritten
        logger.debug(`Query rewritten: "${query}" → "${searchQuery}"`)
      } catch {
        // Fall back to original query
      }
    }

    // Step 2: Vector search
    const queryVector = await this.embedding.embedQuery(searchQuery)
    const vectorResults = await this.vectorStore.search(
      queryVector,
      undefined,
      Math.max(limit * 4, 40),
      options.filter
    )

    // Step 3: Graph retrieval (if enabled)
    let graphResults: RetrievalResult[] = []
    if (enableGraph) {
      graphResults = await this.graphRetrieve(query, limit * 2)
    }

    // Step 4: RRF fusion
    const fused = this.rrfFuse(
      vectorResults.map((r) => ({
        id: r.id,
        content: (r.payload?.content as string) || '',
        score: r.score,
        source: (r.payload?.source as string) || '',
        title: r.payload?.title as string,
        heading: r.payload?.heading as string,
        sourceType: r.payload?.source_type as string,
      })),
      graphResults,
      limit
    )

    return fused
  }

  /**
   * Graph-based retrieval: find related entities and their connected chunks.
   */
  private async graphRetrieve(query: string, limit: number): Promise<RetrievalResult[]> {
    try {
      const entities = await this.graphService.searchEntities(query, 5)
      if (entities.length === 0) return []

      const results: RetrievalResult[] = []
      for (const entity of entities) {
        const related = await this.graphService.queryRelated(entity.name, 2, limit)
        for (const rel of related) {
          results.push({
            id: `graph-${entity.name}-${rel.name}`,
            content: `${entity.name} (${entity.type}) → ${rel.relationship} → ${rel.name} (${rel.type})`,
            score: 0.5,
            source: 'knowledge_graph',
            title: entity.name,
          })
        }
      }

      return results.slice(0, limit)
    } catch {
      logger.debug('Graph retrieval failed, falling back to vector-only')
      return []
    }
  }

  /**
   * Reciprocal Rank Fusion: combine ranked lists from different sources.
   * RRF score = sum(1 / (k + rank_i)) for each list containing the item.
   */
  private rrfFuse(
    vectorResults: RetrievalResult[],
    graphResults: RetrievalResult[],
    limit: number,
    k: number = 60
  ): RetrievalResult[] {
    const scores = new Map<string, { score: number; result: RetrievalResult }>()

    // Score vector results
    for (let i = 0; i < vectorResults.length; i++) {
      const key = this.dedupeKey(vectorResults[i])
      const existing = scores.get(key)
      const rrfScore = 1 / (k + i + 1)
      if (existing) {
        existing.score += rrfScore
      } else {
        scores.set(key, { score: rrfScore, result: vectorResults[i] })
      }
    }

    // Score graph results
    for (let i = 0; i < graphResults.length; i++) {
      const key = this.dedupeKey(graphResults[i])
      const existing = scores.get(key)
      const rrfScore = 1 / (k + i + 1)
      if (existing) {
        existing.score += rrfScore
      } else {
        scores.set(key, { score: rrfScore, result: graphResults[i] })
      }
    }

    // Sort by fused score and return top-N
    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({ ...entry.result, score: entry.score }))
  }

  /**
   * Generate a deduplication key for a result.
   * Uses content hash for vector results, id for graph results.
   */
  private dedupeKey(result: RetrievalResult): string {
    if (result.id.startsWith('graph-')) return result.id
    // Use first 100 chars of content as a rough dedup key
    return `vec-${result.content.slice(0, 100)}`
  }
}
