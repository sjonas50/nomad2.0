import { readdir, stat, unlink } from 'node:fs/promises'
import { join, extname, basename } from 'node:path'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

interface ZimFile {
  name: string
  path: string
  sizeMb: number
  category: string
}

export default class ZimService {
  private storageDir: string

  constructor() {
    this.storageDir = env.get('ZIM_STORAGE_DIR', '/data/zim')
  }

  /**
   * Scan the storage directory for .zim files and return metadata for each.
   */
  async listFiles(): Promise<ZimFile[]> {
    const results: ZimFile[] = []

    let entries: string[]
    try {
      entries = await readdir(this.storageDir)
    } catch (error) {
      logger.error({ err: error, dir: this.storageDir }, 'Failed to read ZIM storage directory')
      return results
    }

    for (const entry of entries) {
      if (extname(entry).toLowerCase() !== '.zim') {
        continue
      }

      const fullPath = join(this.storageDir, entry)
      try {
        const fileStat = await stat(fullPath)
        results.push({
          name: entry,
          path: fullPath,
          sizeMb: Math.round((fileStat.size / (1024 * 1024)) * 100) / 100,
          category: this.getCategoryFromName(entry),
        })
      } catch (error) {
        logger.warn({ err: error, file: entry }, 'Failed to stat ZIM file, skipping')
      }
    }

    logger.info({ count: results.length }, 'Listed ZIM files')
    return results
  }

  /**
   * Look up a single ZIM file by name.
   */
  async getFile(name: string): Promise<ZimFile | null> {
    const fullPath = join(this.storageDir, name)

    try {
      const fileStat = await stat(fullPath)
      if (extname(name).toLowerCase() !== '.zim') {
        return null
      }

      return {
        name,
        path: fullPath,
        sizeMb: Math.round((fileStat.size / (1024 * 1024)) * 100) / 100,
        category: this.getCategoryFromName(name),
      }
    } catch {
      return null
    }
  }

  /**
   * Derive a human-readable category from a ZIM filename.
   *
   * Common conventions:
   *   wikipedia_en_all_maxi_2024-01.zim  -> "Wikipedia"
   *   wiktionary_en_all_maxi_2024-01.zim -> "Wiktionary"
   *   wikivoyage_en_all_maxi_2024-01.zim -> "Wikivoyage"
   *   gutenberg_en_all_2024-01.zim       -> "Gutenberg"
   *   stackexchange_en_all_2024-01.zim   -> "Stack Exchange"
   */
  getCategoryFromName(filename: string): string {
    const base = basename(filename, '.zim').toLowerCase()

    const categoryMap: Record<string, string> = {
      wikipedia: 'Wikipedia',
      wiktionary: 'Wiktionary',
      wikivoyage: 'Wikivoyage',
      wikibooks: 'Wikibooks',
      wikisource: 'Wikisource',
      wikiquote: 'Wikiquote',
      wikinews: 'Wikinews',
      wikiversity: 'Wikiversity',
      gutenberg: 'Gutenberg',
      stackexchange: 'Stack Exchange',
      ted: 'TED',
      vikidia: 'Vikidia',
    }

    for (const [prefix, category] of Object.entries(categoryMap)) {
      if (base.startsWith(prefix)) {
        return category
      }
    }

    return 'Other'
  }

  /**
   * Delete a ZIM file by name.
   */
  async deleteFile(name: string): Promise<void> {
    const fullPath = join(this.storageDir, name)

    try {
      await unlink(fullPath)
      logger.info({ file: name }, 'Deleted ZIM file')
    } catch (error) {
      logger.error({ err: error, file: name }, 'Failed to delete ZIM file')
      throw error
    }
  }
}
