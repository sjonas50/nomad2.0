import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  mkdir,
  readdir,
  stat,
  readFile,
  writeFile,
  unlink,
} from 'node:fs/promises'
import { join, basename } from 'node:path'
import { createGzip } from 'node:zlib'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import logger from '@adonisjs/core/services/logger'

const execFileAsync = promisify(execFile)

const BUNDLE_DIR = process.env.BUNDLE_DIR || '/tmp/attic-bundles'
const BUNDLE_STAGING_DIR = join(BUNDLE_DIR, '.staging')

export interface BundleManifest {
  version: 1
  createdAt: string
  nodeId: string
  incidentId?: number
  components: {
    mysql: boolean
    qdrant: boolean
    knowledge: boolean
    yjs: boolean
  }
  stats: {
    incidents: number
    activityLogs: number
    knowledgeSources: number
  }
}

export interface BundleInfo {
  filename: string
  path: string
  sizeBytes: number
  createdAt: string
  manifest: BundleManifest | null
}

export default class BundleService {
  private nodeId: string

  constructor() {
    this.nodeId = process.env.NODE_ID || `attic-${Date.now().toString(36)}`
  }

  /**
   * Export a full .attic bundle (tar.gz containing MySQL dump, Qdrant snapshot,
   * Yjs state, and a manifest).
   */
  async exportBundle(options?: { incidentId?: number; outputPath?: string; passphrase?: string }): Promise<BundleInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const bundleName = options?.incidentId
      ? `attic-incident-${options.incidentId}-${timestamp}.attic`
      : `attic-full-${timestamp}.attic`

    const stagingDir = join(BUNDLE_STAGING_DIR, timestamp)
    await mkdir(stagingDir, { recursive: true })

    try {
      const manifest: BundleManifest = {
        version: 1,
        createdAt: new Date().toISOString(),
        nodeId: this.nodeId,
        incidentId: options?.incidentId,
        components: { mysql: false, qdrant: false, knowledge: false, yjs: false },
        stats: { incidents: 0, activityLogs: 0, knowledgeSources: 0 },
      }

      // 1. MySQL dump
      try {
        await this.dumpMysql(stagingDir, options?.incidentId)
        manifest.components.mysql = true
      } catch (err) {
        logger.warn({ err }, 'MySQL dump skipped in bundle export')
      }

      // 2. Qdrant snapshot
      try {
        await this.snapshotQdrant(stagingDir)
        manifest.components.qdrant = true
      } catch (err) {
        logger.warn({ err }, 'Qdrant snapshot skipped in bundle export')
      }

      // 3. Yjs state (if directory exists)
      try {
        const yjsDir = process.env.YJS_STORAGE_DIR || 'storage/yjs'
        const yjsStat = await stat(yjsDir).catch(() => null)
        if (yjsStat?.isDirectory()) {
          await execFileAsync('cp', ['-r', yjsDir, join(stagingDir, 'yjs')])
          manifest.components.yjs = true
        }
      } catch (err) {
        logger.warn({ err }, 'Yjs state skipped in bundle export')
      }

      // 4. Write manifest
      await writeFile(
        join(stagingDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      )

      // 5. Create tar.gz
      await mkdir(BUNDLE_DIR, { recursive: true })
      const outputPath = options?.outputPath || join(BUNDLE_DIR, bundleName)
      await execFileAsync('tar', ['-czf', outputPath, '-C', stagingDir, '.'])

      // 6. Encrypt if passphrase provided
      if (options?.passphrase) {
        const plainData = await readFile(outputPath)
        const encrypted = await this.encrypt(plainData, options.passphrase)
        await writeFile(outputPath, encrypted)
        manifest.components.knowledge = true // repurpose as "encrypted" flag
        logger.info({ bundle: bundleName }, 'Bundle encrypted with AES-256-GCM')
      }

      const stats = await stat(outputPath)
      logger.info({ bundle: bundleName, size: stats.size }, 'Bundle exported')

      return {
        filename: basename(outputPath),
        path: outputPath,
        sizeBytes: stats.size,
        createdAt: manifest.createdAt,
        manifest,
      }
    } finally {
      // Cleanup staging
      await execFileAsync('rm', ['-rf', stagingDir]).catch(() => {})
    }
  }

  /**
   * Import a .attic bundle. Reads manifest and applies components.
   */
  async importBundle(bundlePath: string, passphrase?: string): Promise<{ manifest: BundleManifest; applied: string[] }> {
    const stagingDir = join(BUNDLE_STAGING_DIR, `import-${Date.now()}`)
    await mkdir(stagingDir, { recursive: true })

    try {
      // Decrypt if passphrase provided
      let extractPath = bundlePath
      if (passphrase) {
        const encryptedData = await readFile(bundlePath)
        const decrypted = await this.decrypt(encryptedData, passphrase)
        extractPath = join(stagingDir, 'decrypted.tar.gz')
        await writeFile(extractPath, decrypted)
      }

      // Extract bundle
      await execFileAsync('tar', ['-xzf', extractPath, '-C', stagingDir])

      // Read manifest
      const manifestPath = join(stagingDir, 'manifest.json')
      const manifestRaw = await readFile(manifestPath, 'utf-8')
      const manifest: BundleManifest = JSON.parse(manifestRaw)

      if (manifest.version !== 1) {
        throw new Error(`Unsupported bundle version: ${manifest.version}`)
      }

      const applied: string[] = []

      // Apply MySQL dump
      if (manifest.components.mysql) {
        try {
          await this.restoreMysql(stagingDir)
          applied.push('mysql')
        } catch (err) {
          logger.warn({ err }, 'MySQL restore failed during import')
        }
      }

      // Apply Qdrant snapshot
      if (manifest.components.qdrant) {
        try {
          await this.restoreQdrant(stagingDir)
          applied.push('qdrant')
        } catch (err) {
          logger.warn({ err }, 'Qdrant restore failed during import')
        }
      }

      // Apply Yjs state
      if (manifest.components.yjs) {
        try {
          const yjsDir = process.env.YJS_STORAGE_DIR || 'storage/yjs'
          await mkdir(yjsDir, { recursive: true })
          const importYjsDir = join(stagingDir, 'yjs')
          const yjsStat = await stat(importYjsDir).catch(() => null)
          if (yjsStat?.isDirectory()) {
            await execFileAsync('cp', ['-r', importYjsDir + '/.', yjsDir])
            applied.push('yjs')
          }
        } catch (err) {
          logger.warn({ err }, 'Yjs state restore failed during import')
        }
      }

      logger.info({ manifest, applied }, 'Bundle imported')
      return { manifest, applied }
    } finally {
      await execFileAsync('rm', ['-rf', stagingDir]).catch(() => {})
    }
  }

  /**
   * List available bundles in the bundle directory.
   */
  async listBundles(): Promise<BundleInfo[]> {
    try {
      await mkdir(BUNDLE_DIR, { recursive: true })
      const files = await readdir(BUNDLE_DIR)
      const bundles: BundleInfo[] = []

      for (const file of files) {
        if (!file.endsWith('.attic')) continue
        const filePath = join(BUNDLE_DIR, file)
        const stats = await stat(filePath)
        bundles.push({
          filename: file,
          path: filePath,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
          manifest: null, // Reading manifest requires extraction — skip for listing
        })
      }

      return bundles.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    } catch {
      return []
    }
  }

  /**
   * Delete a bundle.
   */
  async deleteBundle(filename: string): Promise<void> {
    if (!filename.endsWith('.attic')) throw new Error('Invalid bundle filename')
    const filePath = join(BUNDLE_DIR, filename)
    const resolved = (await import('node:path')).resolve(filePath)
    const resolvedDir = (await import('node:path')).resolve(BUNDLE_DIR)
    if (!resolved.startsWith(resolvedDir)) throw new Error('Invalid bundle path')
    await unlink(filePath)
    logger.info({ filename }, 'Bundle deleted')
  }

  private async dumpMysql(stagingDir: string, _incidentId?: number): Promise<void> {
    const host = process.env.DB_HOST || '127.0.0.1'
    const port = process.env.DB_PORT || '3306'
    const user = process.env.DB_USER || 'attic'
    const password = process.env.DB_PASSWORD || ''
    const database = process.env.DB_DATABASE || 'attic'

    const args = ['-h', host, '-P', port, '-u', user]
    if (password) args.push(`-p${password}`)
    args.push(database)

    const { stdout } = await execFileAsync('mysqldump', args)
    const dumpPath = join(stagingDir, 'mysql-dump.sql.gz')

    const { Readable } = await import('node:stream')
    await pipeline(
      Readable.from(Buffer.from(stdout)),
      createGzip(),
      createWriteStream(dumpPath)
    )
  }

  private async restoreMysql(stagingDir: string): Promise<void> {
    const dumpPath = join(stagingDir, 'mysql-dump.sql.gz')
    const dumpStat = await stat(dumpPath).catch(() => null)
    if (!dumpStat) return

    const host = process.env.DB_HOST || '127.0.0.1'
    const port = process.env.DB_PORT || '3306'
    const user = process.env.DB_USER || 'attic'
    const password = process.env.DB_PASSWORD || ''
    const database = process.env.DB_DATABASE || 'attic'

    const { gunzipSync } = await import('node:zlib')
    const compressed = await readFile(dumpPath)
    const sql = gunzipSync(compressed).toString('utf-8')

    const mysqlArgs = ['-h', host, '-P', port, '-u', user]
    if (password) mysqlArgs.push(`-p${password}`)
    mysqlArgs.push(database)

    await execFileAsync('mysql', mysqlArgs, { input: sql } as any)
  }

  private async snapshotQdrant(stagingDir: string): Promise<void> {
    const qdrantHost = process.env.QDRANT_HOST || 'http://127.0.0.1:6333'
    const collection = process.env.QDRANT_COLLECTION || 'attic_knowledge_base'

    const response = await fetch(`${qdrantHost}/collections/${collection}/snapshots`, {
      method: 'POST',
    })
    if (!response.ok) throw new Error(`Qdrant snapshot failed: HTTP ${response.status}`)

    const data = (await response.json()) as { result: { name: string } }
    const snapshotName = data.result.name

    const downloadUrl = `${qdrantHost}/collections/${collection}/snapshots/${snapshotName}`
    const snapshotRes = await fetch(downloadUrl)
    if (!snapshotRes.ok || !snapshotRes.body) {
      throw new Error('Failed to download Qdrant snapshot')
    }

    const buffer = Buffer.from(await snapshotRes.arrayBuffer())
    await writeFile(join(stagingDir, 'qdrant.snapshot'), buffer)
  }

  private async restoreQdrant(stagingDir: string): Promise<void> {
    const snapshotPath = join(stagingDir, 'qdrant.snapshot')
    const snapshotStat = await stat(snapshotPath).catch(() => null)
    if (!snapshotStat) return

    const qdrantHost = process.env.QDRANT_HOST || 'http://127.0.0.1:6333'
    const collection = process.env.QDRANT_COLLECTION || 'attic_knowledge_base'

    const snapshotData = await readFile(snapshotPath)
    const response = await fetch(
      `${qdrantHost}/collections/${collection}/snapshots/upload`,
      {
        method: 'POST',
        body: snapshotData,
        headers: { 'Content-Type': 'application/octet-stream' },
      }
    )

    if (!response.ok) {
      logger.warn(`Qdrant snapshot restore returned ${response.status}`)
    }
  }

  /**
   * Encrypt data with AES-256-GCM using a passphrase-derived key (scrypt).
   * Format: [16-byte salt][12-byte IV][ciphertext][16-byte auth tag]
   */
  async encrypt(data: Buffer, passphrase: string): Promise<Buffer> {
    const { scryptSync, randomBytes, createCipheriv } = await import('node:crypto')
    const salt = randomBytes(16)
    const key = scryptSync(passphrase, salt, 32)
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([salt, iv, encrypted, tag])
  }

  /**
   * Decrypt data encrypted with encrypt().
   */
  async decrypt(data: Buffer, passphrase: string): Promise<Buffer> {
    const { scryptSync, createDecipheriv } = await import('node:crypto')
    const salt = data.subarray(0, 16)
    const iv = data.subarray(16, 28)
    const tag = data.subarray(data.length - 16)
    const encrypted = data.subarray(28, data.length - 16)
    const key = scryptSync(passphrase, salt, 32)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()])
  }
}
