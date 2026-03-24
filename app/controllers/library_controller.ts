import type { HttpContext } from '@adonisjs/core/http'
import CollectionManifestService from '#services/collection_manifest_service'
import InstalledResource from '#models/installed_resource'
import DownloadService from '#services/download_service'
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
}
