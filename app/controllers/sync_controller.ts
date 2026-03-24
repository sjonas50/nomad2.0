import type { HttpContext } from '@adonisjs/core/http'
import BundleService from '#services/bundle_service'
import SyncService from '#services/sync_service'
import PeerDiscoveryService from '#services/peer_discovery_service'

export default class SyncController {
  /**
   * GET /api/sync/status — Get sync status including peers and state hash.
   */
  async status(ctx: HttpContext) {
    ctx.auth.getUserOrFail()

    const syncService = new SyncService()
    const status = await syncService.getStatus()
    const stateHash = await syncService.getStateHash()

    return ctx.response.ok({ ...status, stateHash })
  }

  /**
   * GET /api/sync/peers — Discover peers on the local network.
   */
  async peers(ctx: HttpContext) {
    ctx.auth.getUserOrFail()

    const discovery = new PeerDiscoveryService()
    const peers = await discovery.scanOnce()

    return ctx.response.ok({ peers })
  }

  /**
   * POST /api/sync/export — Export a .attic bundle.
   */
  async exportBundle(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    if (!user.isAdmin && user.role !== 'operator') {
      return ctx.response.forbidden({ error: 'Operator access required' })
    }

    const { incidentId } = ctx.request.only(['incidentId'])
    const bundleService = new BundleService()

    const result = await bundleService.exportBundle({
      incidentId: incidentId ? Number(incidentId) : undefined,
    })

    return ctx.response.ok({
      filename: result.filename,
      path: result.path,
      sizeBytes: result.sizeBytes,
      createdAt: result.createdAt,
      manifest: result.manifest,
    })
  }

  /**
   * POST /api/sync/import — Import a .attic bundle (file upload).
   */
  async importBundle(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    if (!user.isAdmin) {
      return ctx.response.forbidden({ error: 'Admin access required' })
    }

    const file = ctx.request.file('bundle', {
      size: '500mb',
      extnames: ['attic'],
    })

    if (!file || !file.isValid) {
      return ctx.response.badRequest({ error: 'Invalid .attic bundle file' })
    }

    const bundleService = new BundleService()
    const result = await bundleService.importBundle(file.tmpPath!)

    return ctx.response.ok({
      manifest: result.manifest,
      applied: result.applied,
    })
  }

  /**
   * GET /api/sync/bundles — List available bundles.
   */
  async listBundles(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const bundleService = new BundleService()
    const bundles = await bundleService.listBundles()
    return ctx.response.ok({ bundles })
  }

  /**
   * DELETE /api/sync/bundles/:filename — Delete a bundle.
   */
  async deleteBundle(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    if (!user.isAdmin) {
      return ctx.response.forbidden({ error: 'Admin access required' })
    }

    const filename = ctx.params.filename
    const bundleService = new BundleService()
    await bundleService.deleteBundle(filename)
    return ctx.response.ok({ deleted: true })
  }

  /**
   * GET /api/sync/download/:filename — Download a bundle file.
   */
  async downloadBundle(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const filename = ctx.params.filename
    const bundleService = new BundleService()
    const bundles = await bundleService.listBundles()
    const bundle = bundles.find((b) => b.filename === filename)

    if (!bundle) {
      return ctx.response.notFound({ error: 'Bundle not found' })
    }

    return ctx.response.download(bundle.path, true)
  }
}
