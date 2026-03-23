import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import logger from '@adonisjs/core/services/logger'

const execAsync = promisify(exec)

export interface BackupInfo {
  filename: string
  path: string
  sizeBytes: number
  createdAt: string
  type: 'mysql' | 'qdrant' | 'full'
}

const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp/attic-backups'

export default class BackupService {
  /**
   * Create a MySQL database dump.
   */
  async backupMysql(): Promise<BackupInfo> {
    await mkdir(BACKUP_DIR, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `mysql-${timestamp}.sql.gz`
    const filePath = join(BACKUP_DIR, filename)

    const host = process.env.DB_HOST || '127.0.0.1'
    const port = process.env.DB_PORT || '3306'
    const user = process.env.DB_USER || 'attic'
    const password = process.env.DB_PASSWORD || ''
    const database = process.env.DB_DATABASE || 'attic'

    const cmd = `mysqldump -h ${host} -P ${port} -u ${user} ${password ? `-p${password}` : ''} ${database} | gzip > ${filePath}`

    try {
      await execAsync(cmd)
      const stats = await stat(filePath)
      logger.info({ filename, size: stats.size }, 'MySQL backup created')

      return {
        filename,
        path: filePath,
        sizeBytes: stats.size,
        createdAt: new Date().toISOString(),
        type: 'mysql',
      }
    } catch (error) {
      logger.error({ error }, 'MySQL backup failed')
      throw new Error(`MySQL backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a Qdrant collection snapshot.
   */
  async backupQdrant(): Promise<BackupInfo> {
    await mkdir(BACKUP_DIR, { recursive: true })

    const qdrantHost = process.env.QDRANT_HOST || 'http://127.0.0.1:6333'
    const collection = process.env.QDRANT_COLLECTION || 'attic_knowledge_base'

    try {
      const response = await fetch(`${qdrantHost}/collections/${collection}/snapshots`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Qdrant snapshot failed: HTTP ${response.status}`)
      }

      const data = await response.json() as { result: { name: string } }
      const snapshotName = data.result.name

      // Download the snapshot
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `qdrant-${timestamp}.snapshot`
      const filePath = join(BACKUP_DIR, filename)

      const downloadUrl = `${qdrantHost}/collections/${collection}/snapshots/${snapshotName}`
      const snapshotRes = await fetch(downloadUrl)
      if (!snapshotRes.ok || !snapshotRes.body) {
        throw new Error('Failed to download Qdrant snapshot')
      }

      const { writeFile } = await import('node:fs/promises')
      const buffer = Buffer.from(await snapshotRes.arrayBuffer())
      await writeFile(filePath, buffer)

      const stats = await stat(filePath)
      logger.info({ filename, size: stats.size }, 'Qdrant backup created')

      return {
        filename,
        path: filePath,
        sizeBytes: stats.size,
        createdAt: new Date().toISOString(),
        type: 'qdrant',
      }
    } catch (error) {
      logger.error({ error }, 'Qdrant backup failed')
      throw new Error(`Qdrant backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * List all existing backups.
   */
  async listBackups(): Promise<BackupInfo[]> {
    try {
      await mkdir(BACKUP_DIR, { recursive: true })
      const files = await readdir(BACKUP_DIR)
      const backups: BackupInfo[] = []

      for (const file of files) {
        const filePath = join(BACKUP_DIR, file)
        const stats = await stat(filePath)

        let type: 'mysql' | 'qdrant' | 'full' = 'full'
        if (file.startsWith('mysql-')) type = 'mysql'
        else if (file.startsWith('qdrant-')) type = 'qdrant'

        backups.push({
          filename: file,
          path: filePath,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
          type,
        })
      }

      return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    } catch {
      return []
    }
  }

  /**
   * Delete a backup file.
   */
  async deleteBackup(filename: string): Promise<void> {
    const filePath = join(BACKUP_DIR, filename)
    // Prevent path traversal
    if (!filePath.startsWith(BACKUP_DIR)) {
      throw new Error('Invalid backup filename')
    }
    await unlink(filePath)
    logger.info({ filename }, 'Backup deleted')
  }

  /**
   * Restore a MySQL backup.
   */
  async restoreMysql(filename: string): Promise<void> {
    const filePath = join(BACKUP_DIR, filename)
    if (!filePath.startsWith(BACKUP_DIR)) {
      throw new Error('Invalid backup filename')
    }

    const host = process.env.DB_HOST || '127.0.0.1'
    const port = process.env.DB_PORT || '3306'
    const user = process.env.DB_USER || 'attic'
    const password = process.env.DB_PASSWORD || ''
    const database = process.env.DB_DATABASE || 'attic'

    const cmd = `gunzip -c ${filePath} | mysql -h ${host} -P ${port} -u ${user} ${password ? `-p${password}` : ''} ${database}`

    try {
      await execAsync(cmd)
      logger.info({ filename }, 'MySQL restore completed')
    } catch (error) {
      logger.error({ error }, 'MySQL restore failed')
      throw new Error(`MySQL restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
