import { readdir, stat, unlink } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

interface MapRegion {
  name: string
  path: string
  sizeMb: number
  region: string
}

export default class MapService {
  private storageDir: string

  constructor() {
    this.storageDir = env.get('MAP_STORAGE_DIR', '/data/maps')
  }

  /**
   * Scan the storage directory for .pmtiles files and return metadata for each.
   */
  async listRegions(): Promise<MapRegion[]> {
    const results: MapRegion[] = []

    let entries: string[]
    try {
      entries = await readdir(this.storageDir)
    } catch (error) {
      logger.error({ err: error, dir: this.storageDir }, 'Failed to read map storage directory')
      return results
    }

    for (const entry of entries) {
      if (extname(entry).toLowerCase() !== '.pmtiles') {
        continue
      }

      const fullPath = join(this.storageDir, entry)
      try {
        const fileStat = await stat(fullPath)
        results.push({
          name: entry,
          path: fullPath,
          sizeMb: Math.round((fileStat.size / (1024 * 1024)) * 100) / 100,
          region: this.getRegionFromName(entry),
        })
      } catch (error) {
        logger.warn({ err: error, file: entry }, 'Failed to stat PMTiles file, skipping')
      }
    }

    logger.info({ count: results.length }, 'Listed map regions')
    return results
  }

  /**
   * Look up a single map region by filename.
   */
  async getRegion(name: string): Promise<MapRegion | null> {
    const fullPath = join(this.storageDir, name)

    try {
      const fileStat = await stat(fullPath)
      if (extname(name).toLowerCase() !== '.pmtiles') {
        return null
      }

      return {
        name,
        path: fullPath,
        sizeMb: Math.round((fileStat.size / (1024 * 1024)) * 100) / 100,
        region: this.getRegionFromName(name),
      }
    } catch {
      return null
    }
  }

  /**
   * Delete a PMTiles file by name.
   */
  async deleteRegion(name: string): Promise<void> {
    const fullPath = join(this.storageDir, name)

    try {
      await unlink(fullPath)
      logger.info({ file: name }, 'Deleted map region file')
    } catch (error) {
      logger.error({ err: error, file: name }, 'Failed to delete map region file')
      throw error
    }
  }

  /**
   * Derive a human-readable region label from a PMTiles filename.
   *
   * Common naming:
   *   north-america.pmtiles  -> "North America"
   *   europe.pmtiles         -> "Europe"
   *   us-west.pmtiles        -> "Us West"
   */
  getRegionFromName(filename: string): string {
    const base = basename(filename, '.pmtiles').toLowerCase()

    const regionMap: Record<string, string> = {
      'north-america': 'North America',
      'south-america': 'South America',
      'central-america': 'Central America',
      'europe': 'Europe',
      'asia': 'Asia',
      'africa': 'Africa',
      'oceania': 'Oceania',
      'antarctica': 'Antarctica',
      'us-west': 'US West',
      'us-east': 'US East',
      'us-midwest': 'US Midwest',
      'us-south': 'US South',
      'caribbean': 'Caribbean',
      'middle-east': 'Middle East',
      'southeast-asia': 'Southeast Asia',
      'planet': 'Planet (Global)',
    }

    if (regionMap[base]) {
      return regionMap[base]
    }

    // Fallback: convert kebab-case to title case
    return base
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }
}
