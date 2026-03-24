import { execFile } from 'node:child_process'
import { stat, mkdir, chmod, access } from 'node:fs/promises'
import { join } from 'node:path'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

// ---------------------------------------------------------------------------
// Region definitions
// ---------------------------------------------------------------------------

export interface MapRegionDef {
  id: string
  name: string
  group: 'state' | 'fema' | 'national' | 'territory'
  bbox: string // west,south,east,north
  estimateMb: number // rough estimate at z14
}

/** All 50 states + DC */
const US_STATES: MapRegionDef[] = [
  { id: 'al', name: 'Alabama', group: 'state', bbox: '-88.473,30.223,-84.889,35.008', estimateMb: 500 },
  { id: 'az', name: 'Arizona', group: 'state', bbox: '-114.817,31.332,-109.045,37.004', estimateMb: 600 },
  { id: 'ar', name: 'Arkansas', group: 'state', bbox: '-94.618,33.004,-89.644,36.500', estimateMb: 400 },
  { id: 'ca', name: 'California', group: 'state', bbox: '-124.410,32.534,-114.131,42.010', estimateMb: 2500 },
  { id: 'co', name: 'Colorado', group: 'state', bbox: '-109.060,36.992,-102.042,41.003', estimateMb: 800 },
  { id: 'ct', name: 'Connecticut', group: 'state', bbox: '-73.728,40.980,-71.787,42.051', estimateMb: 200 },
  { id: 'de', name: 'Delaware', group: 'state', bbox: '-75.789,38.451,-75.049,39.839', estimateMb: 80 },
  { id: 'dc', name: 'Washington DC', group: 'state', bbox: '-77.120,38.792,-76.909,38.995', estimateMb: 50 },
  { id: 'fl', name: 'Florida', group: 'state', bbox: '-87.635,24.523,-80.031,31.001', estimateMb: 1500 },
  { id: 'ga', name: 'Georgia', group: 'state', bbox: '-85.605,30.358,-80.840,35.001', estimateMb: 800 },
  { id: 'hi', name: 'Hawaii', group: 'state', bbox: '-178.335,18.910,-154.807,28.402', estimateMb: 100 },
  { id: 'id', name: 'Idaho', group: 'state', bbox: '-117.243,41.988,-111.044,49.001', estimateMb: 400 },
  { id: 'il', name: 'Illinois', group: 'state', bbox: '-91.513,36.970,-87.495,42.508', estimateMb: 1000 },
  { id: 'in', name: 'Indiana', group: 'state', bbox: '-88.098,37.772,-84.785,41.761', estimateMb: 600 },
  { id: 'ia', name: 'Iowa', group: 'state', bbox: '-96.640,40.376,-90.140,43.501', estimateMb: 500 },
  { id: 'ks', name: 'Kansas', group: 'state', bbox: '-102.052,36.993,-94.588,40.003', estimateMb: 500 },
  { id: 'ky', name: 'Kentucky', group: 'state', bbox: '-89.572,36.497,-81.965,39.147', estimateMb: 500 },
  { id: 'la', name: 'Louisiana', group: 'state', bbox: '-94.043,28.929,-88.817,33.019', estimateMb: 500 },
  { id: 'me', name: 'Maine', group: 'state', bbox: '-71.084,42.978,-66.950,47.460', estimateMb: 300 },
  { id: 'md', name: 'Maryland', group: 'state', bbox: '-79.488,37.912,-75.049,39.723', estimateMb: 400 },
  { id: 'ma', name: 'Massachusetts', group: 'state', bbox: '-73.508,41.238,-69.928,42.887', estimateMb: 400 },
  { id: 'mi', name: 'Michigan', group: 'state', bbox: '-90.418,41.696,-82.413,48.239', estimateMb: 800 },
  { id: 'mn', name: 'Minnesota', group: 'state', bbox: '-97.239,43.499,-89.492,49.384', estimateMb: 600 },
  { id: 'ms', name: 'Mississippi', group: 'state', bbox: '-91.655,30.174,-88.098,34.996', estimateMb: 400 },
  { id: 'mo', name: 'Missouri', group: 'state', bbox: '-95.775,35.996,-89.099,40.614', estimateMb: 600 },
  { id: 'mt', name: 'Montana', group: 'state', bbox: '-116.050,44.358,-104.039,49.001', estimateMb: 400 },
  { id: 'ne', name: 'Nebraska', group: 'state', bbox: '-104.054,40.000,-95.308,43.002', estimateMb: 400 },
  { id: 'nv', name: 'Nevada', group: 'state', bbox: '-120.006,35.002,-114.040,42.002', estimateMb: 400 },
  { id: 'nh', name: 'New Hampshire', group: 'state', bbox: '-72.557,42.697,-70.611,45.305', estimateMb: 200 },
  { id: 'nj', name: 'New Jersey', group: 'state', bbox: '-75.560,38.929,-73.894,41.357', estimateMb: 400 },
  { id: 'nm', name: 'New Mexico', group: 'state', bbox: '-109.050,31.332,-103.002,37.000', estimateMb: 400 },
  { id: 'ny', name: 'New York', group: 'state', bbox: '-79.762,40.496,-71.856,45.016', estimateMb: 1200 },
  { id: 'nc', name: 'North Carolina', group: 'state', bbox: '-84.322,33.842,-75.461,36.588', estimateMb: 700 },
  { id: 'nd', name: 'North Dakota', group: 'state', bbox: '-104.049,45.935,-96.555,49.001', estimateMb: 300 },
  { id: 'oh', name: 'Ohio', group: 'state', bbox: '-84.820,38.403,-80.519,41.978', estimateMb: 800 },
  { id: 'ok', name: 'Oklahoma', group: 'state', bbox: '-103.003,33.616,-94.431,37.002', estimateMb: 500 },
  { id: 'or', name: 'Oregon', group: 'state', bbox: '-124.566,41.992,-116.464,46.292', estimateMb: 500 },
  { id: 'pa', name: 'Pennsylvania', group: 'state', bbox: '-80.520,39.720,-74.690,42.270', estimateMb: 800 },
  { id: 'ri', name: 'Rhode Island', group: 'state', bbox: '-71.863,41.146,-71.121,42.019', estimateMb: 60 },
  { id: 'sc', name: 'South Carolina', group: 'state', bbox: '-83.354,32.035,-78.542,35.215', estimateMb: 400 },
  { id: 'sd', name: 'South Dakota', group: 'state', bbox: '-104.058,42.480,-96.437,45.946', estimateMb: 300 },
  { id: 'tn', name: 'Tennessee', group: 'state', bbox: '-90.310,34.983,-81.647,36.678', estimateMb: 500 },
  { id: 'tx', name: 'Texas', group: 'state', bbox: '-106.646,25.837,-93.508,36.501', estimateMb: 2500 },
  { id: 'ut', name: 'Utah', group: 'state', bbox: '-114.053,36.998,-109.041,42.002', estimateMb: 400 },
  { id: 'vt', name: 'Vermont', group: 'state', bbox: '-73.438,42.727,-71.465,45.017', estimateMb: 200 },
  { id: 'va', name: 'Virginia', group: 'state', bbox: '-83.675,36.541,-75.242,39.466', estimateMb: 600 },
  { id: 'wa', name: 'Washington', group: 'state', bbox: '-124.763,45.544,-116.916,49.002', estimateMb: 600 },
  { id: 'wv', name: 'West Virginia', group: 'state', bbox: '-82.645,37.201,-77.720,40.639', estimateMb: 300 },
  { id: 'wi', name: 'Wisconsin', group: 'state', bbox: '-92.888,42.492,-86.805,47.081', estimateMb: 500 },
  { id: 'wy', name: 'Wyoming', group: 'state', bbox: '-111.057,40.995,-104.052,45.006', estimateMb: 300 },
]

/** FEMA regions */
const FEMA_REGIONS: MapRegionDef[] = [
  { id: 'fema-1', name: 'FEMA Region I — New England', group: 'fema', bbox: '-73.728,40.980,-66.950,47.460', estimateMb: 1500 },
  { id: 'fema-2', name: 'FEMA Region II — NY/NJ', group: 'fema', bbox: '-79.762,38.929,-71.856,45.016', estimateMb: 2000 },
  { id: 'fema-3', name: 'FEMA Region III — Mid-Atlantic', group: 'fema', bbox: '-83.675,37.201,-74.690,42.270', estimateMb: 2500 },
  { id: 'fema-4', name: 'FEMA Region IV — Southeast', group: 'fema', bbox: '-90.310,24.523,-75.460,39.147', estimateMb: 5000 },
  { id: 'fema-5', name: 'FEMA Region V — Great Lakes', group: 'fema', bbox: '-97.239,36.970,-82.413,49.384', estimateMb: 4000 },
  { id: 'fema-6', name: 'FEMA Region VI — South Central', group: 'fema', bbox: '-109.050,25.837,-88.817,37.003', estimateMb: 5000 },
  { id: 'fema-7', name: 'FEMA Region VII — Plains', group: 'fema', bbox: '-104.054,35.996,-90.140,43.501', estimateMb: 2500 },
  { id: 'fema-8', name: 'FEMA Region VIII — Mountain', group: 'fema', bbox: '-116.050,36.993,-96.437,49.001', estimateMb: 3000 },
  { id: 'fema-9', name: 'FEMA Region IX — Pacific', group: 'fema', bbox: '-124.410,31.332,-109.041,42.010', estimateMb: 4000 },
  { id: 'fema-10', name: 'FEMA Region X — Pacific NW', group: 'fema', bbox: '-124.763,41.988,-111.044,49.002', estimateMb: 2000 },
]

/** National-level extracts */
const NATIONAL: MapRegionDef[] = [
  { id: 'conus', name: 'Continental US (CONUS)', group: 'national', bbox: '-124.763,24.523,-66.950,49.384', estimateMb: 20000 },
]

/** Territories */
const TERRITORIES: MapRegionDef[] = [
  { id: 'pr', name: 'Puerto Rico', group: 'territory', bbox: '-67.945,17.883,-65.221,18.516', estimateMb: 100 },
  { id: 'usvi', name: 'US Virgin Islands', group: 'territory', bbox: '-65.085,17.674,-64.565,18.413', estimateMb: 20 },
  { id: 'gu', name: 'Guam', group: 'territory', bbox: '144.618,13.234,144.957,13.654', estimateMb: 10 },
  { id: 'as', name: 'American Samoa', group: 'territory', bbox: '-171.090,-14.549,-168.143,-11.047', estimateMb: 10 },
  { id: 'mp', name: 'Northern Mariana Islands', group: 'territory', bbox: '144.886,14.110,146.065,20.554', estimateMb: 10 },
]

export const ALL_REGIONS: MapRegionDef[] = [...NATIONAL, ...FEMA_REGIONS, ...US_STATES, ...TERRITORIES]

export const FEMA_STATE_MAP: Record<string, string[]> = {
  'fema-1': ['ct', 'me', 'ma', 'nh', 'ri', 'vt'],
  'fema-2': ['nj', 'ny'],
  'fema-3': ['dc', 'de', 'md', 'pa', 'va', 'wv'],
  'fema-4': ['al', 'fl', 'ga', 'ky', 'ms', 'nc', 'sc', 'tn'],
  'fema-5': ['il', 'in', 'mi', 'mn', 'oh', 'wi'],
  'fema-6': ['ar', 'la', 'nm', 'ok', 'tx'],
  'fema-7': ['ia', 'ks', 'mo', 'ne'],
  'fema-8': ['co', 'mt', 'nd', 'sd', 'ut', 'wy'],
  'fema-9': ['az', 'ca', 'nv'],
  'fema-10': ['id', 'or', 'wa'],
}

// ---------------------------------------------------------------------------
// Extraction tracking
// ---------------------------------------------------------------------------

export interface ExtractJob {
  regionId: string
  regionName: string
  status: 'queued' | 'installing_cli' | 'extracting' | 'done' | 'failed'
  startedAt: number
  progress?: string
  error?: string
  filePath?: string
  sizeMb?: number
}

const activeJobs = new Map<string, ExtractJob>()

// ---------------------------------------------------------------------------
// go-pmtiles binary auto-install
// ---------------------------------------------------------------------------

const CLI_VERSION = '1.30.1'

function getPlatformAsset(): { url: string; ext: 'zip' | 'tar.gz' } {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
  if (process.platform === 'darwin') {
    // macOS: hyphen separator, .zip
    return {
      url: `https://github.com/protomaps/go-pmtiles/releases/download/v${CLI_VERSION}/go-pmtiles-${CLI_VERSION}_Darwin_${arch}.zip`,
      ext: 'zip',
    }
  }
  // Linux: underscore separator, .tar.gz
  return {
    url: `https://github.com/protomaps/go-pmtiles/releases/download/v${CLI_VERSION}/go-pmtiles_${CLI_VERSION}_Linux_${arch}.tar.gz`,
    ext: 'tar.gz',
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const MAX_ZOOM = 14
const DOWNLOAD_THREADS = 4

/** Find the latest available Protomaps planet build URL */
async function getLatestBuildUrl(): Promise<string> {
  // Try today, then go back up to 7 days
  const now = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '')
    const url = `https://build.protomaps.com/${dateStr}.pmtiles`
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok) return url
    } catch { /* try next */ }
  }
  throw new Error('No recent Protomaps planet build found')
}

export default class MapExtractService {
  private storageDir: string
  private binDir: string

  constructor() {
    const appRoot = new URL('../../', import.meta.url).pathname
    this.storageDir = env.get('MAP_STORAGE_DIR', join(appRoot, 'storage', 'maps')) as string
    this.binDir = join(appRoot, '.tools')
  }

  private get cliBinPath(): string {
    return join(this.binDir, 'pmtiles')
  }

  getRegions(): MapRegionDef[] {
    return ALL_REGIONS
  }

  getJobs(): ExtractJob[] {
    return Array.from(activeJobs.values())
  }

  getJob(regionId: string): ExtractJob | undefined {
    return activeJobs.get(regionId)
  }

  /** Check if the local pmtiles binary exists and is executable */
  async checkCli(): Promise<boolean> {
    try {
      await access(this.cliBinPath)
      return true
    } catch {
      return false
    }
  }

  /** Download and install the go-pmtiles binary into .tools/ */
  async installCli(): Promise<void> {
    const asset = getPlatformAsset()
    logger.info({ url: asset.url }, 'Downloading go-pmtiles binary')

    await mkdir(this.binDir, { recursive: true })

    const res = await fetch(asset.url, { redirect: 'follow' })
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download pmtiles CLI: ${res.status} ${res.statusText}`)
    }

    const archivePath = join(this.binDir, `pmtiles-download.${asset.ext}`)
    const ws = createWriteStream(archivePath)
    await pipeline(res.body as any, ws)

    // Extract the binary
    if (asset.ext === 'zip') {
      await new Promise<void>((resolve, reject) => {
        execFile('unzip', ['-o', archivePath, '-d', this.binDir], (err) => {
          if (err) reject(new Error(`Failed to unzip pmtiles: ${err.message}`))
          else resolve()
        })
      })
    } else {
      await new Promise<void>((resolve, reject) => {
        execFile('tar', ['xzf', archivePath, '-C', this.binDir], (err) => {
          if (err) reject(new Error(`Failed to extract pmtiles: ${err.message}`))
          else resolve()
        })
      })
    }

    await chmod(this.cliBinPath, 0o755)

    // Clean up archive
    const { unlink } = await import('node:fs/promises')
    await unlink(archivePath).catch(() => {})

    // Verify it runs
    await new Promise<void>((resolve, reject) => {
      execFile(this.cliBinPath, ['version'], { timeout: 5000 }, (err, stdout) => {
        if (err) reject(new Error(`pmtiles binary not working: ${err.message}`))
        else {
          logger.info({ version: stdout.trim(), path: this.cliBinPath }, 'go-pmtiles CLI installed')
          resolve()
        }
      })
    })
  }

  /** Ensure the CLI is available, installing if needed */
  async ensureCli(): Promise<string> {
    if (await this.checkCli()) {
      return this.cliBinPath
    }
    await this.installCli()
    return this.cliBinPath
  }

  async isDownloaded(regionId: string): Promise<{ downloaded: boolean; sizeMb?: number }> {
    const filePath = join(this.storageDir, `${regionId}.pmtiles`)
    try {
      const s = await stat(filePath)
      return { downloaded: true, sizeMb: Math.round((s.size / (1024 * 1024)) * 100) / 100 }
    } catch {
      return { downloaded: false }
    }
  }

  /** Start extracting a region in the background */
  async startExtract(regionId: string): Promise<ExtractJob> {
    const region = ALL_REGIONS.find((r) => r.id === regionId)
    if (!region) throw new Error(`Unknown region: ${regionId}`)

    const existing = activeJobs.get(regionId)
    if (existing && (existing.status === 'extracting' || existing.status === 'installing_cli')) {
      return existing
    }

    await mkdir(this.storageDir, { recursive: true })

    const outputPath = join(this.storageDir, `${regionId}.pmtiles`)

    const job: ExtractJob = {
      regionId,
      regionName: region.name,
      status: 'installing_cli',
      startedAt: Date.now(),
      progress: 'Checking pmtiles CLI...',
    }
    activeJobs.set(regionId, job)

    // Run async — don't await
    this.runExtract(job, region, outputPath).catch((err) => {
      job.status = 'failed'
      job.error = err instanceof Error ? err.message : 'Extract failed'
      logger.error({ regionId, error: job.error }, 'PMTiles extraction failed')
    })

    return job
  }

  private async runExtract(job: ExtractJob, region: MapRegionDef, outputPath: string): Promise<void> {
    // Ensure CLI is available (auto-downloads if missing)
    let cliBin: string
    try {
      job.progress = 'Installing pmtiles CLI...'
      cliBin = await this.ensureCli()
      job.progress = 'Starting extraction...'
    } catch (err) {
      job.status = 'failed'
      job.error = `CLI install failed: ${err instanceof Error ? err.message : 'unknown error'}`
      return
    }

    job.status = 'extracting'
    job.progress = 'Finding latest planet build...'

    let planetUrl: string
    try {
      planetUrl = await getLatestBuildUrl()
    } catch (err) {
      job.status = 'failed'
      job.error = err instanceof Error ? err.message : 'Could not find planet build'
      return
    }

    logger.info({ regionId: job.regionId, bbox: region.bbox, outputPath, planetUrl }, 'Starting PMTiles extraction')
    job.progress = 'Downloading tiles...'

    const args = [
      'extract',
      planetUrl,
      outputPath,
      `--bbox=${region.bbox}`,
      `--maxzoom=${MAX_ZOOM}`,
      `--download-threads=${DOWNLOAD_THREADS}`,
      '--overfetch=0.05',
    ]

    await new Promise<void>((resolve, reject) => {
      const child = execFile(cliBin, args, {
        timeout: 30 * 60 * 1000,
      }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(err.message || stderr || 'Extraction failed'))
        } else {
          resolve()
        }
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim()
        if (line) {
          job.progress = line.slice(0, 200)
        }
      })
    })

    const s = await stat(outputPath)
    job.status = 'done'
    job.filePath = outputPath
    job.sizeMb = Math.round((s.size / (1024 * 1024)) * 100) / 100
    job.progress = undefined
    logger.info({ regionId: job.regionId, sizeMb: job.sizeMb }, 'PMTiles extraction complete')
  }

  async deleteRegion(regionId: string): Promise<void> {
    const filePath = join(this.storageDir, `${regionId}.pmtiles`)
    const { unlink } = await import('node:fs/promises')
    await unlink(filePath)
    activeJobs.delete(regionId)
    logger.info({ regionId }, 'Deleted PMTiles region file')
  }
}
