import type { HttpContext } from '@adonisjs/core/http'
import KnowledgeSource from '#models/knowledge_source'
import IngestionService from '#services/ingestion_service'
import string from '@adonisjs/core/helpers/string'
import app from '@adonisjs/core/services/app'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export default class KnowledgeController {
  /**
   * Show the knowledge base management page.
   * GET /knowledge
   */
  async index({ inertia }: HttpContext) {
    const sources = await KnowledgeSource.query().orderBy('createdAt', 'desc').limit(100)
    return inertia.render('knowledge' as any, {
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        sourceType: s.sourceType,
        status: s.status,
        chunkCount: s.chunkCount,
        fileSize: s.fileSize,
        errorMessage: s.errorMessage,
        createdAt: s.createdAt?.toISO(),
        completedAt: s.completedAt?.toISO(),
      })),
    })
  }

  /**
   * Upload a file for ingestion.
   * POST /knowledge/upload
   */
  async upload({ request, response }: HttpContext) {
    const file = request.file('file', {
      size: '500mb',
      extnames: ['pdf', 'txt', 'md', 'html', 'csv', 'json'],
    })

    if (!file || file.hasErrors) {
      return response.badRequest({
        error: file?.errors?.[0]?.message || 'Invalid file',
      })
    }

    // Save to uploads directory
    const uploadsDir = join(app.makePath('storage'), 'uploads')
    await mkdir(uploadsDir, { recursive: true })
    const fileName = `${string.random(24)}-${file.clientName}`
    const filePath = join(uploadsDir, fileName)

    await file.move(uploadsDir, { name: fileName })

    // Create knowledge source record
    const source = await KnowledgeSource.create({
      name: file.clientName,
      filePath,
      sourceType: 'upload',
      mimeType: file.headers['content-type'] || null,
      status: 'pending',
      fileSize: file.size || 0,
    })

    // Start ingestion (async, don't await)
    const ingestion = new IngestionService()
    ingestion.ingestFile(source.id).catch(() => {
      // Error is recorded on the source record
    })

    return response.created({
      id: source.id,
      name: source.name,
      status: source.status,
    })
  }

  /**
   * Upload raw text for ingestion.
   * POST /knowledge/text
   */
  async uploadText({ request, response }: HttpContext) {
    const { title, content } = request.only(['title', 'content'])

    if (!title || !content) {
      return response.badRequest({ error: 'Title and content are required' })
    }

    const source = await KnowledgeSource.create({
      name: title,
      sourceType: 'text',
      status: 'pending',
      fileSize: Buffer.byteLength(content, 'utf-8'),
    })

    const ingestion = new IngestionService()
    ingestion.ingestText(source.id, content).catch(() => {})

    return response.created({
      id: source.id,
      name: source.name,
      status: source.status,
    })
  }

  /**
   * Get source status.
   * GET /api/knowledge/:id
   */
  async show({ params, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const source = await KnowledgeSource.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()
    return {
      id: source.id,
      name: source.name,
      sourceType: source.sourceType,
      status: source.status,
      chunkCount: source.chunkCount,
      fileSize: source.fileSize,
      errorMessage: source.errorMessage,
      metadata: source.metadata,
      createdAt: source.createdAt?.toISO(),
      completedAt: source.completedAt?.toISO(),
    }
  }

  /**
   * Re-embed a source.
   * POST /api/knowledge/:id/re-embed
   */
  async reEmbed({ params, response, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const source = await KnowledgeSource.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()
    const ingestion = new IngestionService()
    ingestion.reEmbed(source.id).catch(() => {})
    return response.ok({ status: 'started' })
  }

  /**
   * Delete a source and its vectors.
   * DELETE /api/knowledge/:id
   */
  async destroy({ params, response, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    // Verify the source belongs to the current user
    await KnowledgeSource.query()
      .where('id', params.id)
      .where('userId', user.id)
      .firstOrFail()
    const ingestion = new IngestionService()
    await ingestion.deleteSource(params.id)
    return response.noContent()
  }
}
