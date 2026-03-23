import KnowledgeSource from '#models/knowledge_source'
import type { IngestionStatus } from '#models/knowledge_source'
import ContentExtractorService from '#services/content_extractor_service'
import ChunkingService from '#services/chunking_service'
import EmbeddingService from '#services/embedding_service'
import VectorStoreService from '#services/vector_store_service'
import GraphService from '#services/graph_service'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { DateTime } from 'luxon'

interface IngestionOptions {
  enableGraph?: boolean
  chunkSize?: number
  chunkOverlap?: number
}

export default class IngestionService {
  private extractor: ContentExtractorService
  private chunker: ChunkingService
  private embedder: EmbeddingService
  private vectorStore: VectorStoreService
  private graphService: GraphService

  constructor() {
    this.extractor = new ContentExtractorService()
    this.chunker = new ChunkingService()
    this.embedder = new EmbeddingService()
    this.vectorStore = new VectorStoreService()
    this.graphService = new GraphService()
  }

  /**
   * Ingest a file through the full pipeline:
   * Extract → Chunk → Embed → (optional) Entity Extract
   */
  async ingestFile(sourceId: number, options: IngestionOptions = {}): Promise<void> {
    const source = await KnowledgeSource.findOrFail(sourceId)

    try {
      // Step 1: Extract text
      await this.updateStatus(source, 'extracting')
      const extraction = await this.extractor.extract(source.filePath!)
      logger.info(`Extracted ${extraction.metadata.wordCount} words from ${source.name}`)

      // Step 2: Chunk
      await this.updateStatus(source, 'chunking')
      const chunks = this.chunker.chunkStructured(extraction.text, {
        chunkSize: options.chunkSize,
        overlap: options.chunkOverlap,
      })
      logger.info(`Created ${chunks.length} chunks from ${source.name}`)

      // Step 3: Embed + upsert to vector store
      await this.updateStatus(source, 'embedding')
      const embedResults = await this.embedder.embedDocuments(
        chunks.map((c) => c.text),
        (progress) => {
          logger.debug(`Embedding progress: ${progress.percent}%`)
        }
      )

      const points = embedResults.map((result, i) => ({
        denseVector: result.vector,
        payload: {
          content: chunks[i].text,
          source: source.name,
          source_id: String(source.id),
          source_type: source.sourceType,
          content_type: extraction.metadata.fileType,
          chunk_index: i,
          heading: chunks[i].metadata.heading || null,
          created_at: Date.now(),
        },
      }))

      await this.vectorStore.ensureCollection()
      await this.vectorStore.upsert(points)
      logger.info(`Upserted ${points.length} vectors for ${source.name}`)

      // Step 4: Entity extraction (optional, graph-gated)
      const graphEnabled =
        options.enableGraph !== false && env.get('FALKORDB_ENABLED', false)
      if (graphEnabled) {
        await this.updateStatus(source, 'entity_extracting')
        await this.extractEntities(source, chunks.map((c) => c.text))
      }

      // Done
      source.status = 'completed'
      source.chunkCount = chunks.length
      source.completedAt = DateTime.now()
      source.metadata = {
        ...source.metadata,
        wordCount: extraction.metadata.wordCount,
        pageCount: extraction.metadata.pageCount,
        fileType: extraction.metadata.fileType,
      }
      await source.save()
      logger.info(`Ingestion completed for ${source.name}`)
    } catch (error) {
      source.status = 'failed'
      source.errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await source.save()
      logger.error(`Ingestion failed for ${source.name}: ${source.errorMessage}`)
      throw error
    }
  }

  /**
   * Ingest raw text (for API-based content or ZIM articles).
   */
  async ingestText(
    sourceId: number,
    text: string,
    options: IngestionOptions = {}
  ): Promise<void> {
    const source = await KnowledgeSource.findOrFail(sourceId)

    try {
      await this.updateStatus(source, 'chunking')
      const chunks = this.chunker.chunkStructured(text, {
        chunkSize: options.chunkSize,
        overlap: options.chunkOverlap,
      })

      await this.updateStatus(source, 'embedding')
      const embedResults = await this.embedder.embedDocuments(chunks.map((c) => c.text))

      const points = embedResults.map((result, i) => ({
        denseVector: result.vector,
        payload: {
          content: chunks[i].text,
          source: source.name,
          source_id: String(source.id),
          source_type: source.sourceType,
          chunk_index: i,
          heading: chunks[i].metadata.heading || null,
          created_at: Date.now(),
        },
      }))

      await this.vectorStore.ensureCollection()
      await this.vectorStore.upsert(points)

      source.status = 'completed'
      source.chunkCount = chunks.length
      source.completedAt = DateTime.now()
      await source.save()
    } catch (error) {
      source.status = 'failed'
      source.errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await source.save()
      throw error
    }
  }

  /**
   * Re-embed an existing source (e.g., after model change).
   */
  async reEmbed(sourceId: number): Promise<void> {
    const source = await KnowledgeSource.findOrFail(sourceId)

    // Delete existing vectors
    await this.vectorStore.deleteByFilter({
      must: [{ key: 'source_id', match: { value: String(source.id) } }],
    })

    // Reset and re-ingest
    source.status = 'pending'
    source.chunkCount = 0
    source.completedAt = null
    source.errorMessage = null
    await source.save()

    await this.ingestFile(sourceId)
  }

  /**
   * Delete a source and its vectors.
   */
  async deleteSource(sourceId: number): Promise<void> {
    const source = await KnowledgeSource.findOrFail(sourceId)

    await this.vectorStore.deleteByFilter({
      must: [{ key: 'source_id', match: { value: String(source.id) } }],
    })

    await source.delete()
    logger.info(`Deleted source and vectors: ${source.name}`)
  }

  private async extractEntities(
    source: KnowledgeSource,
    chunks: string[]
  ): Promise<void> {
    const sidecarUrl = env.get('SIDECAR_URL', 'http://localhost:8100')
    const ollamaHost = env.get('OLLAMA_HOST', 'http://localhost:11434')

    // Send chunks in batches to the sidecar for entity extraction
    for (const chunk of chunks.slice(0, 50)) {
      try {
        const response = await fetch(`${sidecarUrl}/extract/entities`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk, ollama_host: ollamaHost }),
        })

        if (!response.ok) continue

        const data = (await response.json()) as {
          entities: Array<{ name: string; type: string }>
          relationships: Array<{ from: string; to: string; type: string }>
        }

        for (const entity of data.entities) {
          await this.graphService.addEntity(entity.name, entity.type, {
            source: source.name,
            source_id: source.id,
          })
        }

        for (const rel of data.relationships) {
          await this.graphService.addRelationship(rel.from, rel.to, rel.type)
        }
      } catch {
        // Entity extraction is best-effort
        logger.debug(`Entity extraction failed for chunk in ${source.name}`)
      }
    }
  }

  private async updateStatus(
    source: KnowledgeSource,
    status: IngestionStatus
  ): Promise<void> {
    source.status = status
    await source.save()
  }
}
