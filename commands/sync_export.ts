import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class SyncExport extends BaseCommand {
  static commandName = 'sync:export'
  static description = 'Export a .attic sneakernet bundle for offline data transfer'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Output path for the .attic bundle', required: false })
  declare outputPath?: string

  @flags.number({ description: 'Export only a specific incident', alias: 'i' })
  declare incidentId?: number

  @flags.string({ description: 'Encrypt bundle with passphrase', alias: 'p' })
  declare passphrase?: string

  async run() {
    const BundleService = (await import('#services/bundle_service')).default
    const bundleService = new BundleService()

    this.logger.info('Creating .attic bundle...')
    if (this.passphrase) {
      this.logger.info('Bundle will be encrypted with AES-256-GCM')
    }

    try {
      const result = await bundleService.exportBundle({
        incidentId: this.incidentId,
        outputPath: this.outputPath,
        passphrase: this.passphrase,
      })

      const sizeMB = (result.sizeBytes / (1024 * 1024)).toFixed(2)
      this.logger.success(`Bundle exported: ${result.path} (${sizeMB} MB)`)

      if (result.manifest) {
        const m = result.manifest
        const components = Object.entries(m.components)
          .filter(([, v]) => v)
          .map(([k]) => k)
        this.logger.info(`Components: ${components.join(', ')}`)
        this.logger.info(`Node ID: ${m.nodeId}`)
      }
    } catch (error) {
      this.logger.error(`Export failed: ${error instanceof Error ? error.message : error}`)
      this.exitCode = 1
    }
  }
}
