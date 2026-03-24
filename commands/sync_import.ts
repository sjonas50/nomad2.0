import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class SyncImport extends BaseCommand {
  static commandName = 'sync:import'
  static description = 'Import a .attic sneakernet bundle from another Attic instance'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Path to the .attic bundle file' })
  declare bundlePath: string

  @flags.string({ description: 'Decrypt bundle with passphrase', alias: 'p' })
  declare passphrase?: string

  async run() {
    const BundleService = (await import('#services/bundle_service')).default
    const bundleService = new BundleService()

    this.logger.info(`Importing bundle: ${this.bundlePath}`)

    try {
      const { stat } = await import('node:fs/promises')
      await stat(this.bundlePath)
    } catch {
      this.logger.error(`File not found: ${this.bundlePath}`)
      this.exitCode = 1
      return
    }

    if (!this.bundlePath.endsWith('.attic')) {
      this.logger.error('File must be a .attic bundle')
      this.exitCode = 1
      return
    }

    try {
      const result = await bundleService.importBundle(this.bundlePath, this.passphrase)

      this.logger.success(`Bundle imported successfully`)
      this.logger.info(`Source node: ${result.manifest.nodeId}`)
      this.logger.info(`Created at: ${result.manifest.createdAt}`)
      this.logger.info(`Components applied: ${result.applied.join(', ') || 'none'}`)
    } catch (error) {
      this.logger.error(`Import failed: ${error instanceof Error ? error.message : error}`)
      this.exitCode = 1
    }
  }
}
