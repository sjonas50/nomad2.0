import type { HttpContext } from '@adonisjs/core/http'
import CollectionManifestService from '#services/collection_manifest_service'
import InstalledResource from '#models/installed_resource'
import DownloadService from '#services/download_service'
import { randomUUID } from 'node:crypto'
import env from '#start/env'
import SecurityMiddleware from '#middleware/security_middleware'

export default class LibraryController {
  /**
   * Show the content library page.
   * GET /library
   */
  async index({ inertia }: HttpContext) {
    const manifest = new CollectionManifestService()
    const [available, installed] = await Promise.all([
      manifest.getAvailableContent(),
      InstalledResource.query().orderBy('createdAt', 'desc'),
    ])

    return inertia.render('library' as any, {
      available: available.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        sizeMb: item.sizeMb,
        category: item.category,
        type: item.type,
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

    if (!url || !name) {
      return response.badRequest({ error: 'URL and name are required' })
    }

    if (!SecurityMiddleware.isUrlSafe(url)) {
      return response.badRequest({ error: 'URL targets a blocked network range' })
    }

    const destDir =
      type === 'pmtiles'
        ? env.get('MAP_STORAGE_DIR', '/data/maps')
        : env.get('ZIM_STORAGE_DIR', '/data/zim')

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
      })
      .catch(async (error) => {
        resource.status = 'failed'
        resource.errorMessage = error instanceof Error ? error.message : 'Download failed'
        await resource.save()
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
