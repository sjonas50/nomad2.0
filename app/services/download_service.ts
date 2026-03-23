import { createWriteStream } from 'node:fs'
import { mkdir, unlink, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import logger from '@adonisjs/core/services/logger'

export type DownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled'

interface DownloadProgress {
  downloadId: string
  bytesDownloaded: number
  totalBytes: number
  percent: number
  speedBps: number
}

interface DownloadRequest {
  id: string
  url: string
  destDir: string
  fileName: string
  priority?: number
  maxBandwidthBps?: number
}

interface DownloadResult {
  id: string
  filePath: string
  totalBytes: number
  durationMs: number
}

// Active downloads tracking
const activeDownloads = new Map<
  string,
  { controller: AbortController; status: DownloadStatus; progress: DownloadProgress }
>()

export default class DownloadService {
  /**
   * Start a download with progress tracking and optional bandwidth throttling.
   */
  async download(
    request: DownloadRequest,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<DownloadResult> {
    const { id, url, destDir, fileName, maxBandwidthBps } = request
    const filePath = join(destDir, fileName)
    const controller = new AbortController()

    activeDownloads.set(id, {
      controller,
      status: 'downloading',
      progress: { downloadId: id, bytesDownloaded: 0, totalBytes: 0, percent: 0, speedBps: 0 },
    })

    try {
      await mkdir(destDir, { recursive: true })
      logger.info({ url, filePath }, 'Starting download')

      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const totalBytes = Number(response.headers.get('content-length')) || 0
      const startTime = Date.now()
      let bytesDownloaded = 0

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const writeStream = createWriteStream(filePath)

      // Create a throttled readable stream
      const readable = new Readable({
        async read() {
          try {
            const { done, value } = await reader.read()
            if (done) {
              this.push(null)
              return
            }

            bytesDownloaded += value.length

            // Bandwidth throttling
            if (maxBandwidthBps) {
              const elapsed = (Date.now() - startTime) / 1000
              const expectedBytes = maxBandwidthBps * elapsed
              if (bytesDownloaded > expectedBytes) {
                const delay = ((bytesDownloaded - expectedBytes) / maxBandwidthBps) * 1000
                await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 1000)))
              }
            }

            // Report progress
            const elapsed = Math.max(Date.now() - startTime, 1)
            const progress: DownloadProgress = {
              downloadId: id,
              bytesDownloaded,
              totalBytes,
              percent: totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0,
              speedBps: Math.round((bytesDownloaded / elapsed) * 1000),
            }

            const active = activeDownloads.get(id)
            if (active) active.progress = progress
            onProgress?.(progress)

            this.push(Buffer.from(value))
          } catch (error) {
            this.destroy(error instanceof Error ? error : new Error(String(error)))
          }
        },
      })

      await pipeline(readable, writeStream)

      const durationMs = Date.now() - startTime
      const active = activeDownloads.get(id)
      if (active) active.status = 'completed'

      logger.info({ id, filePath, totalBytes: bytesDownloaded, durationMs }, 'Download completed')

      return { id, filePath, totalBytes: bytesDownloaded, durationMs }
    } catch (error) {
      const active = activeDownloads.get(id)
      if (active) active.status = 'failed'

      // Clean up partial file
      try {
        await unlink(filePath)
      } catch {
        // ignore
      }

      logger.error({ id, url, error }, 'Download failed')
      throw error
    } finally {
      activeDownloads.delete(id)
    }
  }

  /**
   * Cancel an active download.
   */
  cancel(downloadId: string): boolean {
    const active = activeDownloads.get(downloadId)
    if (!active) return false

    active.controller.abort()
    active.status = 'cancelled'
    return true
  }

  /**
   * Get progress of an active download.
   */
  getProgress(downloadId: string): DownloadProgress | null {
    return activeDownloads.get(downloadId)?.progress ?? null
  }

  /**
   * Get status of an active download.
   */
  getStatus(downloadId: string): DownloadStatus | null {
    return activeDownloads.get(downloadId)?.status ?? null
  }

  /**
   * List all active downloads.
   */
  listActive(): Array<{ id: string; status: DownloadStatus; progress: DownloadProgress }> {
    return Array.from(activeDownloads.entries()).map(([id, d]) => ({
      id,
      status: d.status,
      progress: d.progress,
    }))
  }

  /**
   * Check if a file exists and return its size.
   */
  async fileExists(filePath: string): Promise<{ exists: boolean; sizeMb: number }> {
    try {
      const s = await stat(filePath)
      return { exists: true, sizeMb: s.size / (1024 * 1024) }
    } catch {
      return { exists: false, sizeMb: 0 }
    }
  }
}
