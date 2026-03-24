import type { HttpContext } from '@adonisjs/core/http'
import { createReadStream, statSync } from 'node:fs'
import { copyFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import PositionService from '#services/position_service'
import GeofenceService from '#services/geofence_service'
import MapService from '#services/map_service'
import MapExtractService from '#services/map_extract_service'
import logger from '@adonisjs/core/services/logger'
import type { GeofenceType, GeoJSONPolygon } from '#models/geofence'

export default class MapController {
  /**
   * GET /map — Render the map page via Inertia.
   */
  async index(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const mapService = new MapService()
    const regions = await mapService.listRegions()
    return ctx.inertia.render('map' as any, {
      tileRegions: regions.map((r) => ({
        name: r.name,
        sizeMb: r.sizeMb,
        region: r.region,
      })),
    })
  }

  /**
   * GET /api/map/tiles/:filename — Serve PMTiles with Range Request support.
   */
  async serveTile(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const filename = ctx.params.filename as string

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return ctx.response.badRequest({ error: 'Invalid filename' })
    }
    if (!filename.endsWith('.pmtiles')) {
      return ctx.response.badRequest({ error: 'Only .pmtiles files supported' })
    }

    const mapService = new MapService()
    const region = await mapService.getRegion(filename)
    if (!region) {
      return ctx.response.notFound({ error: 'Tile file not found' })
    }

    const fileStat = statSync(region.path)
    const totalSize = fileStat.size
    const rangeHeader = ctx.request.header('range')
    const nodeRes = ctx.response.response

    if (!rangeHeader) {
      nodeRes.writeHead(200, {
        'Content-Length': String(totalSize),
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
      })
      createReadStream(region.path).pipe(nodeRes)
      return
    }

    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
    if (!match) {
      nodeRes.writeHead(416, { 'Content-Range': `bytes */${totalSize}` })
      nodeRes.end()
      return
    }

    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : totalSize - 1
    const chunkSize = end - start + 1

    nodeRes.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(chunkSize),
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    })
    createReadStream(region.path, { start, end }).pipe(nodeRes)
  }

  /**
   * GET /api/map/markers — Get all map markers.
   */
  async markers(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const incidentId = ctx.request.qs().incidentId
      ? Number(ctx.request.qs().incidentId)
      : undefined

    const positionService = new PositionService()
    const markers = await positionService.getAllMarkers(incidentId)

    return ctx.response.ok({ markers })
  }

  /**
   * GET /api/map/geofences — List active geofences.
   */
  async geofences(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const incidentId = ctx.request.qs().incidentId
      ? Number(ctx.request.qs().incidentId)
      : undefined

    const service = new GeofenceService()
    const geofences = await service.listGeofences(incidentId)

    return ctx.response.ok({
      geofences: geofences.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        geometry: g.geometry,
        description: g.description,
        color: g.color,
        active: g.active,
      })),
    })
  }

  /**
   * POST /api/map/geofences — Create a geofence.
   */
  async createGeofence(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    if (user.role !== 'admin' && user.role !== 'operator') {
      return ctx.response.forbidden({ error: 'Operator access required' })
    }

    const { name, type, geometry, incidentId, description, color } = ctx.request.only([
      'name',
      'type',
      'geometry',
      'incidentId',
      'description',
      'color',
    ])

    if (!name || !type || !geometry) {
      return ctx.response.badRequest({ error: 'name, type, and geometry are required' })
    }

    const service = new GeofenceService()
    const geofence = await service.createGeofence({
      name,
      type: type as GeofenceType,
      geometry: geometry as GeoJSONPolygon,
      incidentId: incidentId ? Number(incidentId) : undefined,
      description,
      color,
    })

    return ctx.response.created({
      id: geofence.id,
      name: geofence.name,
      type: geofence.type,
    })
  }

  /**
   * POST /api/map/position — Update a node's position.
   */
  async updatePosition(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const { nodeId, latitude, longitude, altitude, callsign, source } = ctx.request.only([
      'nodeId',
      'latitude',
      'longitude',
      'altitude',
      'callsign',
      'source',
    ])

    if (!nodeId || latitude === undefined || longitude === undefined) {
      return ctx.response.badRequest({ error: 'nodeId, latitude, and longitude are required' })
    }

    const positionService = new PositionService()
    await positionService.updatePosition({
      nodeId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      altitude: altitude !== undefined ? Number(altitude) : undefined,
      callsign,
      source: source || 'manual',
    })

    return ctx.response.ok({ updated: true })
  }

  /**
   * POST /api/map/tiles/upload — Upload a PMTiles file.
   */
  async uploadTiles(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    if (user.role !== 'admin' && user.role !== 'operator') {
      return ctx.response.forbidden({ error: 'Operator access required' })
    }

    const file = ctx.request.file('file', {
      extnames: ['pmtiles'],
      size: '200gb',
    })

    if (!file) {
      return ctx.response.badRequest({ error: 'A .pmtiles file is required' })
    }

    if (!file.isValid) {
      return ctx.response.badRequest({ error: file.errors.map((e) => e.message).join(', ') })
    }

    const mapService = new MapService()
    const destDir = mapService.getStorageDir()

    await mkdir(destDir, { recursive: true })

    const destName = file.clientName.replace(/[^a-zA-Z0-9._-]/g, '_')
    const destPath = join(destDir, destName)

    if (file.tmpPath) {
      await copyFile(file.tmpPath, destPath)
    }

    logger.info({ filename: destName, size: file.size }, 'PMTiles file uploaded')

    return ctx.response.created({
      name: destName,
      sizeMb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
    })
  }

  /**
   * DELETE /api/map/tiles/:filename — Delete a PMTiles file.
   */
  async deleteTiles(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    if (user.role !== 'admin') {
      return ctx.response.forbidden({ error: 'Admin access required' })
    }

    const filename = ctx.params.filename as string

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return ctx.response.badRequest({ error: 'Invalid filename' })
    }
    if (!filename.endsWith('.pmtiles')) {
      return ctx.response.badRequest({ error: 'Only .pmtiles files supported' })
    }

    const mapService = new MapService()
    const region = await mapService.getRegion(filename)
    if (!region) {
      return ctx.response.notFound({ error: 'Tile file not found' })
    }

    await unlink(region.path)
    logger.info({ filename }, 'PMTiles file deleted')

    return ctx.response.ok({ deleted: true })
  }

  // -----------------------------------------------------------------------
  // Map region extraction (PMTiles)
  // -----------------------------------------------------------------------

  /**
   * GET /api/map/regions — List available regions with download status.
   */
  async regions(ctx: HttpContext) {
    ctx.auth.getUserOrFail()

    const extractService = new MapExtractService()
    const regions = extractService.getRegions()
    const jobs = extractService.getJobs()

    const regionsWithStatus = await Promise.all(
      regions.map(async (r) => {
        const { downloaded, sizeMb } = await extractService.isDownloaded(r.id)
        const job = jobs.find((j) => j.regionId === r.id)
        const busy = job?.status === 'extracting' || job?.status === 'installing_cli'
        return {
          id: r.id,
          name: r.name,
          group: r.group,
          estimateMb: r.estimateMb,
          downloaded,
          sizeMb: sizeMb ?? null,
          extracting: busy,
          progress: job?.progress ?? null,
          error: job?.status === 'failed' ? job.error : null,
        }
      })
    )

    return ctx.response.ok({ regions: regionsWithStatus })
  }

  /**
   * POST /api/map/extract — Start extracting a region.
   */
  async extractRegion(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    if (user.role !== 'admin' && user.role !== 'operator') {
      return ctx.response.forbidden({ error: 'Operator access required' })
    }

    const regionId = ctx.request.input('regionId') as string
    if (!regionId) {
      return ctx.response.badRequest({ error: 'regionId is required' })
    }

    const extractService = new MapExtractService()

    try {
      const job = await extractService.startExtract(regionId)
      return ctx.response.ok({
        regionId: job.regionId,
        status: job.status,
        progress: job.progress,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extract failed'
      return ctx.response.badRequest({ error: message })
    }
  }

  /**
   * GET /api/map/extract/:regionId — Check extraction status.
   */
  async extractStatus(ctx: HttpContext) {
    ctx.auth.getUserOrFail()

    const regionId = ctx.params.regionId as string
    const extractService = new MapExtractService()
    const job = extractService.getJob(regionId)

    if (!job) {
      const { downloaded, sizeMb } = await extractService.isDownloaded(regionId)
      if (downloaded) {
        return ctx.response.ok({ regionId, status: 'done', sizeMb })
      }
      return ctx.response.ok({ regionId, status: 'not_started' })
    }

    return ctx.response.ok({
      regionId: job.regionId,
      status: job.status,
      progress: job.progress,
      error: job.error,
      sizeMb: job.sizeMb,
      elapsed: Math.round((Date.now() - job.startedAt) / 1000),
    })
  }

  /**
   * DELETE /api/map/regions/:regionId — Delete a downloaded region.
   */
  async deleteRegion(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    if (user.role !== 'admin') {
      return ctx.response.forbidden({ error: 'Admin access required' })
    }

    const regionId = ctx.params.regionId as string
    const extractService = new MapExtractService()

    try {
      await extractService.deleteRegion(regionId)
      return ctx.response.ok({ deleted: true })
    } catch {
      return ctx.response.notFound({ error: 'Region file not found' })
    }
  }
}
