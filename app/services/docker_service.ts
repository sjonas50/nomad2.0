import Docker from 'dockerode'
import logger from '@adonisjs/core/services/logger'

/**
 * Maps docker-compose container names to friendly service names.
 */
const CONTAINER_SERVICE_MAP: Record<string, string> = {
  attic_mysql: 'MySQL',
  attic_redis: 'Redis',
  attic_ollama: 'Ollama',
  attic_qdrant: 'Qdrant',
  attic_falkordb: 'FalkorDB',
  attic_sidecar: 'Python Sidecar',
}

export interface ContainerInfo {
  id: string
  name: string
  serviceName: string
  image: string
  state: string
  status: string
  ports: Array<{ private: number; public?: number }>
}

export interface ContainerStats {
  cpuPercent: number
  memoryUsageMb: number
  memoryLimitMb: number
  memoryPercent: number
}

export default class DockerService {
  private docker: Docker

  constructor() {
    this.docker = new Docker()
  }

  /**
   * Check whether the Docker daemon is reachable.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping()
      return true
    } catch (error) {
      logger.warn({ err: error }, 'Docker daemon is not available')
      return false
    }
  }

  /**
   * List all containers, optionally filtering to only project containers.
   * Returns both running and stopped containers.
   */
  async listContainers(projectOnly: boolean = true): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers({ all: true })

    const mapped = containers.map((c) => {
      const name = c.Names[0]?.replace(/^\//, '') ?? ''
      return {
        id: c.Id,
        name,
        serviceName: CONTAINER_SERVICE_MAP[name] ?? name,
        image: c.Image,
        state: c.State,
        status: c.Status,
        ports: c.Ports.map((p) => ({
          private: p.PrivatePort,
          public: p.PublicPort || undefined,
        })),
      }
    })

    if (projectOnly) {
      const projectNames = new Set(Object.keys(CONTAINER_SERVICE_MAP))
      return mapped.filter((c) => projectNames.has(c.name))
    }

    return mapped
  }

  /**
   * Start a stopped container by ID.
   */
  async startContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId)
    await container.start()
    logger.info({ containerId }, 'Container started')
  }

  /**
   * Stop a running container by ID.
   */
  async stopContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId)
    await container.stop()
    logger.info({ containerId }, 'Container stopped')
  }

  /**
   * Restart a container by ID.
   */
  async restartContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId)
    await container.restart()
    logger.info({ containerId }, 'Container restarted')
  }

  /**
   * Remove a container by ID. Forces removal if the container is running.
   */
  async removeContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId)
    await container.remove({ force: true })
    logger.info({ containerId }, 'Container removed')
  }

  /**
   * Retrieve the last N lines of a container's logs.
   */
  async getContainerLogs(containerId: string, tail: number = 100): Promise<string> {
    const container = this.docker.getContainer(containerId)
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    })

    // dockerode returns a Buffer or string; demux the multiplexed stream header
    // Each frame: 8-byte header (1 byte stream type, 3 padding, 4 byte size) + payload
    if (Buffer.isBuffer(logs)) {
      return this.#demuxStream(logs)
    }

    return String(logs)
  }

  /**
   * Get real-time CPU and memory stats for a container.
   * Uses a single-shot read (stream: false) to avoid hanging.
   */
  async getContainerStats(containerId: string): Promise<ContainerStats> {
    const container = this.docker.getContainer(containerId)
    const stats = (await container.stats({ stream: false })) as Docker.ContainerStats

    const cpuPercent = this.#calculateCpuPercent(stats)
    const memoryUsageBytes = stats.memory_stats.usage - (stats.memory_stats.stats?.cache ?? 0)
    const memoryLimitBytes = stats.memory_stats.limit

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsageMb: Math.round((memoryUsageBytes / 1024 / 1024) * 100) / 100,
      memoryLimitMb: Math.round((memoryLimitBytes / 1024 / 1024) * 100) / 100,
      memoryPercent: Math.round((memoryUsageBytes / memoryLimitBytes) * 10000) / 100,
    }
  }

  /**
   * Pull a Docker image, optionally reporting progress via callback.
   */
  async pullImage(
    imageName: string,
    onProgress?: (progress: string) => void
  ): Promise<void> {
    logger.info({ imageName }, 'Pulling Docker image')

    const stream = await this.docker.pull(imageName)

    return new Promise((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) {
            logger.error({ err, imageName }, 'Failed to pull image')
            reject(err)
          } else {
            logger.info({ imageName }, 'Image pulled successfully')
            resolve()
          }
        },
        (event: { status?: string; progress?: string; id?: string }) => {
          if (onProgress) {
            const msg = event.id
              ? `${event.id}: ${event.status ?? ''} ${event.progress ?? ''}`
              : `${event.status ?? ''} ${event.progress ?? ''}`
            onProgress(msg.trim())
          }
        }
      )
    })
  }

  /**
   * Run a health check on all project services by verifying each container
   * exists and is in a running state.
   */
  async healthCheck(): Promise<Record<string, { healthy: boolean; status: string }>> {
    const containers = await this.listContainers(true)
    const result: Record<string, { healthy: boolean; status: string }> = {}

    // Mark all known services as missing initially
    for (const [, serviceName] of Object.entries(CONTAINER_SERVICE_MAP)) {
      result[serviceName] = { healthy: false, status: 'not found' }
    }

    for (const container of containers) {
      result[container.serviceName] = {
        healthy: container.state === 'running',
        status: container.status,
      }
    }

    return result
  }

  /**
   * Calculate CPU usage percentage from Docker stats using the delta formula:
   * cpuPercent = (delta container CPU / delta system CPU) * numCpus * 100
   */
  #calculateCpuPercent(stats: Docker.ContainerStats): number {
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
    const systemDelta =
      (stats.cpu_stats.system_cpu_usage ?? 0) - (stats.precpu_stats.system_cpu_usage ?? 0)

    if (systemDelta <= 0 || cpuDelta < 0) {
      return 0
    }

    const numCpus = stats.cpu_stats.online_cpus ?? stats.cpu_stats.cpu_usage.percpu_usage?.length ?? 1
    return (cpuDelta / systemDelta) * numCpus * 100
  }

  /**
   * Demultiplex Docker log stream buffer.
   * Docker multiplexes stdout/stderr with an 8-byte header per frame.
   */
  #demuxStream(buffer: Buffer): string {
    const lines: string[] = []
    let offset = 0

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break

      const size = buffer.readUInt32BE(offset + 4)
      offset += 8

      if (offset + size > buffer.length) break

      lines.push(buffer.subarray(offset, offset + size).toString('utf8'))
      offset += size
    }

    return lines.join('').trimEnd()
  }
}
