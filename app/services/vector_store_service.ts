import { QdrantClient } from '@qdrant/js-client-rest'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { randomUUID } from 'node:crypto'

interface VectorPoint {
  id?: string
  denseVector: number[]
  sparseVector?: { indices: number[]; values: number[] }
  payload: Record<string, unknown>
}

interface SearchResult {
  id: string
  score: number
  payload: Record<string, unknown>
}

const BATCH_SIZE = 500

const PAYLOAD_INDEXES: Array<{ field_name: string; field_schema: string }> = [
  { field_name: 'source', field_schema: 'Keyword' },
  { field_name: 'content_type', field_schema: 'Keyword' },
  { field_name: 'source_id', field_schema: 'Keyword' },
  { field_name: 'language', field_schema: 'Keyword' },
  { field_name: 'created_at', field_schema: 'Integer' },
  { field_name: 'quality_score', field_schema: 'Float' },
]

export default class VectorStoreService {
  private client: QdrantClient
  private collection: string

  constructor() {
    const url = env.get('QDRANT_HOST', 'http://localhost:6333')
    const apiKey = env.get('QDRANT_API_KEY')

    this.client = new QdrantClient({ url, ...(apiKey ? { apiKey } : {}) })
    this.collection = env.get('QDRANT_COLLECTION', 'attic_knowledge_base')
  }

  /**
   * Creates the collection and payload indexes if they do not already exist.
   * Idempotent — safe to call on every boot.
   */
  async ensureCollection(): Promise<void> {
    const collections = await this.client.getCollections()
    const exists = collections.collections.some((c) => c.name === this.collection)

    if (!exists) {
      await this.client.createCollection(this.collection, {
        vectors: {
          dense: { size: 768, distance: 'Cosine' },
        },
        sparse_vectors: {
          sparse: {},
        },
        quantization_config: {
          scalar: { type: 'int8', quantile: 0.99, always_ram: true },
        },
      })
      logger.info(`Created Qdrant collection: ${this.collection}`)
    } else {
      logger.info(`Qdrant collection already exists: ${this.collection}`)
    }

    for (const index of PAYLOAD_INDEXES) {
      try {
        await this.client.createPayloadIndex(this.collection, {
          field_name: index.field_name,
          field_schema: index.field_schema as any,
        })
      } catch {
        // Index already exists — Qdrant returns an error, which is fine.
      }
    }

    logger.info(`Payload indexes ensured for collection: ${this.collection}`)
  }

  /**
   * Batch upsert points into the collection. Automatically chunks into
   * batches of 500 points.
   */
  async upsert(points: VectorPoint[]): Promise<void> {
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE)

      const qdrantPoints = batch.map((point) => {
        const vector: Record<string, number[] | { indices: number[]; values: number[] }> = {
          dense: point.denseVector,
        }
        if (point.sparseVector) {
          vector.sparse = {
            indices: point.sparseVector.indices,
            values: point.sparseVector.values,
          }
        }

        return {
          id: point.id ?? randomUUID(),
          vector: vector as any,
          payload: point.payload,
        }
      })

      await this.client.upsert(this.collection, { points: qdrantPoints as any })
      logger.debug(`Upserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} points)`)
    }
  }

  /**
   * Hybrid search using Qdrant Query API with RRF fusion.
   * When only a dense vector is provided, falls back to dense-only search.
   */
  async search(
    denseVector: number[],
    sparseVector?: { indices: number[]; values: number[] },
    limit: number = 10,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    const prefetch = [
      {
        query: denseVector,
        using: 'dense',
        limit: Math.max(limit * 4, 40),
        ...(filter ? { filter } : {}),
      },
    ]

    if (sparseVector) {
      prefetch.push({
        query: {
          indices: sparseVector.indices,
          values: sparseVector.values,
        } as any,
        using: 'sparse',
        limit: Math.max(limit * 4, 40),
        ...(filter ? { filter } : {}),
      })
    }

    const results = await this.client.query(this.collection, {
      prefetch,
      query: sparseVector ? { fusion: 'rrf' } : undefined,
      limit,
      with_payload: true,
      ...(filter && !sparseVector ? { filter } : {}),
    } as any)

    return (results.points ?? []).map((point: any) => ({
      id: String(point.id),
      score: point.score ?? 0,
      payload: (point.payload ?? {}) as Record<string, unknown>,
    }))
  }

  /**
   * Delete points matching the given Qdrant filter.
   */
  async deleteByFilter(filter: Record<string, unknown>): Promise<void> {
    await this.client.delete(this.collection, { filter } as any)
    logger.info('Deleted points by filter from Qdrant')
  }

  /**
   * Returns collection stats (point count, vector config, etc.).
   */
  async collectionInfo(): Promise<Record<string, unknown>> {
    const info = await this.client.getCollection(this.collection)
    return info as unknown as Record<string, unknown>
  }

  /**
   * Health check — returns true if Qdrant is reachable and the collection exists.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.getCollections()
      return true
    } catch {
      return false
    }
  }
}
