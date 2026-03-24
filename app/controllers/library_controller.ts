import type { HttpContext } from '@adonisjs/core/http'
import { createReadStream, statSync } from 'node:fs'
import CollectionManifestService from '#services/collection_manifest_service'
import InstalledResource from '#models/installed_resource'
import KnowledgeSource from '#models/knowledge_source'
import DownloadService from '#services/download_service'
import IngestionService from '#services/ingestion_service'
import { randomUUID } from 'node:crypto'
import env from '#start/env'
import SecurityMiddleware from '#middleware/security_middleware'
import logger from '@adonisjs/core/services/logger'

export default class LibraryController {
  /**
   * Show the content library page.
   * GET /library
   */
  async index({ inertia }: HttpContext) {
    const manifest = new CollectionManifestService()
    const [available, packs, installed] = await Promise.all([
      manifest.getAvailableContent(),
      manifest.getContentPacks(),
      InstalledResource.query().orderBy('createdAt', 'desc'),
    ])

    return inertia.render('library' as any, {
      available: available.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        url: item.url,
        sizeMb: item.sizeMb,
        category: item.category,
        type: item.type,
        tags: item.tags || [],
      })),
      packs: packs.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon,
        color: p.color,
        items: p.items,
        totalSizeMb: p.items.reduce((sum, itemId) => {
          const item = available.find((a) => a.id === itemId)
          return sum + (item?.sizeMb ?? 0)
        }, 0),
      })),
      installed: installed.map((r) => ({
        id: r.id,
        name: r.name,
        resourceType: r.resourceType,
        status: r.status,
        fileSize: r.fileSize,
        ragEnabled: r.ragEnabled,
        knowledgeSourceId: r.knowledgeSourceId,
        filePath: r.filePath,
      })),
    })
  }

  /**
   * Start downloading a resource.
   * POST /api/library/download
   */
  async download({ request, response }: HttpContext) {
    const { url, name, type } = request.only(['url', 'name', 'type'])
    logger.info({ url, name, type }, 'Library download requested')

    if (!url || !name) {
      logger.warn({ url, name }, 'Library download missing url or name')
      return response.badRequest({ error: 'URL and name are required' })
    }

    if (!SecurityMiddleware.isUrlSafe(url)) {
      logger.warn({ url }, 'Library download URL blocked by security check')
      return response.badRequest({ error: 'URL targets a blocked network range' })
    }

    const appRoot = new URL('../..', import.meta.url).pathname
    const defaultStorage = (sub: string) => `${appRoot}storage/${sub}`

    const destDir =
      type === 'pmtiles' || type === 'osm.pbf'
        ? env.get('MAP_STORAGE_DIR', defaultStorage('maps'))
        : type === 'pdf'
          ? env.get('PDF_STORAGE_DIR', defaultStorage('docs'))
          : env.get('ZIM_STORAGE_DIR', defaultStorage('zim'))

    const fileName = url.split('/').pop() || `${name}.${type}`

    const resource = await InstalledResource.create({
      name,
      resourceType: type || 'zim',
      status: 'downloading',
      downloadUrl: url,
      fileSize: 0,
    })

    // Start download in background
    const downloadService = new DownloadService()
    const downloadId = randomUUID()

    logger.info({ downloadId, destDir, fileName }, 'Starting background download')

    downloadService
      .download({
        id: downloadId,
        url,
        destDir,
        fileName,
      })
      .then(async (result) => {
        resource.filePath = result.filePath
        resource.fileSize = result.totalBytes
        resource.status = 'installed'
        await resource.save()
        logger.info({ resourceId: resource.id, filePath: result.filePath }, 'Download installed')

        // Auto-ingest PDFs into RAG
        if (type === 'pdf') {
          this.autoIngest(resource).catch((err) => {
            logger.error({ resourceId: resource.id, error: err.message }, 'Auto-ingest failed')
          })
        }
      })
      .catch(async (error) => {
        resource.status = 'failed'
        resource.errorMessage = error instanceof Error ? error.message : 'Download failed'
        await resource.save()
        logger.error({ resourceId: resource.id, error: resource.errorMessage }, 'Download failed')
      })

    return response.created({
      id: resource.id,
      downloadId,
      name: resource.name,
      status: resource.status,
    })
  }

  /**
   * Manually trigger RAG ingestion for an installed resource.
   * POST /api/library/:id/ingest
   */
  async ingest({ params, response }: HttpContext) {
    const resource = await InstalledResource.findOrFail(params.id)

    if (!resource.filePath) {
      return response.badRequest({ error: 'Resource has no file path — still downloading?' })
    }

    if (resource.status === 'embedding') {
      return response.conflict({ error: 'Ingestion already in progress' })
    }

    // Clean up any previous failed KnowledgeSource so we don't create duplicates
    if (resource.knowledgeSourceId) {
      try {
        const oldKs = await KnowledgeSource.find(resource.knowledgeSourceId)
        if (oldKs && oldKs.status === 'failed') {
          await oldKs.delete()
          resource.knowledgeSourceId = null
          resource.ragEnabled = false
          resource.errorMessage = null
          await resource.save()
        }
      } catch { /* safe to ignore */ }
    }

    // Start ingestion in background
    this.autoIngest(resource).catch((err) => {
      logger.error({ resourceId: resource.id, error: err.message }, 'Manual ingest failed')
    })

    return response.ok({ status: 'ingesting', resourceId: resource.id })
  }

  /**
   * Serve a PDF file for viewing.
   * GET /api/library/:id/read
   */
  async read({ params, response }: HttpContext) {
    const resource = await InstalledResource.findOrFail(params.id)

    if (!resource.filePath) {
      return response.notFound({ error: 'File not available' })
    }

    if (resource.resourceType === 'pdf') {
      try {
        const stats = statSync(resource.filePath)
        response.header('Content-Type', 'application/pdf')
        response.header('Content-Length', String(stats.size))
        response.header('Content-Disposition', `inline; filename="${resource.name}.pdf"`)
        const stream = createReadStream(resource.filePath)
        response.stream(stream)
      } catch {
        return response.notFound({ error: 'File not found on disk' })
      }
      return
    }

    return response.badRequest({ error: `Content viewing not supported for type: ${resource.resourceType}` })
  }

  /**
   * Search articles within a ZIM file via sidecar.
   * GET /api/library/:id/zim/search?q=term
   */
  async zimSearch({ params, request, response }: HttpContext) {
    const resource = await InstalledResource.findOrFail(params.id)

    if (resource.resourceType !== 'zim' || !resource.filePath) {
      return response.badRequest({ error: 'Not a ZIM resource or file not available' })
    }

    const query = request.qs().q || ''
    if (!query) {
      return response.badRequest({ error: 'Query parameter q is required' })
    }

    const sidecarUrl = env.get('SIDECAR_URL', 'http://localhost:8100')

    try {
      const res = await fetch(`${sidecarUrl}/zim/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: resource.filePath,
          query,
          limit: Number(request.qs().limit) || 20,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return response.status(res.status).json({ error: (body as any).detail || 'Sidecar error' })
      }

      return response.ok(await res.json())
    } catch (err) {
      return response.serviceUnavailable({ error: 'Python sidecar is not available. Enable it in Services.' })
    }
  }

  /**
   * Read a single ZIM article via sidecar.
   * GET /api/library/:id/zim/article?path=A/Article_Name
   */
  async zimArticle({ params, request, response }: HttpContext) {
    const resource = await InstalledResource.findOrFail(params.id)

    if (resource.resourceType !== 'zim' || !resource.filePath) {
      return response.badRequest({ error: 'Not a ZIM resource or file not available' })
    }

    const articlePath = request.qs().path
    if (!articlePath) {
      return response.badRequest({ error: 'Query parameter path is required' })
    }

    const sidecarUrl = env.get('SIDECAR_URL', 'http://localhost:8100')

    try {
      const res = await fetch(`${sidecarUrl}/zim/article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: resource.filePath,
          path: articlePath,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return response.status(res.status).json({ error: (body as any).detail || 'Sidecar error' })
      }

      return response.ok(await res.json())
    } catch (err) {
      return response.serviceUnavailable({ error: 'Python sidecar is not available. Enable it in Services.' })
    }
  }

  /**
   * Delete an installed resource.
   * DELETE /api/library/:id
   */
  async destroy({ params, response }: HttpContext) {
    const resource = await InstalledResource.findOrFail(params.id)
    await resource.delete()
    return response.noContent()
  }

  /**
   * Get active downloads status.
   * GET /api/library/downloads
   */
  async downloads() {
    const downloadService = new DownloadService()
    return downloadService.listActive()
  }

  /**
   * Auto-ingest a resource into the RAG pipeline.
   * Creates a KnowledgeSource record and runs the ingestion service.
   */
  private async autoIngest(resource: InstalledResource): Promise<void> {
    resource.status = 'embedding'
    await resource.save()

    try {
      if (resource.resourceType === 'pdf') {
        // PDF: ingest directly via file pipeline
        const ks = await KnowledgeSource.create({
          name: resource.name,
          filePath: resource.filePath,
          sourceType: 'pdf',
          mimeType: 'application/pdf',
          status: 'pending',
          chunkCount: 0,
          fileSize: resource.fileSize,
        })

        resource.knowledgeSourceId = ks.id
        resource.ragEnabled = true
        await resource.save()

        const ingestion = new IngestionService()
        await ingestion.ingestFile(ks.id)

        resource.status = 'ready'
        await resource.save()
        logger.info({ resourceId: resource.id, knowledgeSourceId: ks.id }, 'PDF auto-ingested')
      } else if (resource.resourceType === 'zim') {
        // ZIM: extract articles via sidecar, then ingest text
        const sidecarUrl = env.get('SIDECAR_URL', 'http://localhost:8100')

        const res = await fetch(`${sidecarUrl}/extract/zim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_path: resource.filePath,
            limit: 500,
          }),
        })

        if (!res.ok) {
          throw new Error(`Sidecar ZIM extraction failed: ${res.status}`)
        }

        const articles = (await res.json()) as Array<{ title: string; content: string }>

        const ks = await KnowledgeSource.create({
          name: resource.name,
          filePath: resource.filePath,
          sourceType: 'zim',
          mimeType: 'application/x-zim',
          status: 'pending',
          chunkCount: 0,
          fileSize: resource.fileSize,
          metadata: { articleCount: articles.length },
        })

        resource.knowledgeSourceId = ks.id
        resource.ragEnabled = true
        await resource.save()

        // Combine articles into a single text block with headings for structured chunking
        const combinedText = articles
          .map((a) => `# ${a.title}\n\n${a.content}`)
          .join('\n\n---\n\n')

        const ingestion = new IngestionService()
        await ingestion.ingestText(ks.id, combinedText)

        resource.status = 'ready'
        await resource.save()
        logger.info(
          { resourceId: resource.id, knowledgeSourceId: ks.id, articles: articles.length },
          'ZIM auto-ingested'
        )
      } else {
        // Maps/other types don't get ingested
        resource.status = 'installed'
        await resource.save()
      }
    } catch (error) {
      resource.status = 'failed'
      resource.errorMessage = error instanceof Error ? error.message : 'Ingestion failed'
      await resource.save()
      throw error
    }
  }
}
