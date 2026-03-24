import { createConnection } from 'node:net'

export interface ServiceHealth {
  name: string
  status: 'up' | 'down' | 'degraded'
  latencyMs?: number
  message?: string
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  services: ServiceHealth[]
  capabilities: {
    chat: boolean
    rag: boolean
    graphRag: boolean
    embedding: boolean
    zimExtraction: boolean
    entityExtraction: boolean
  }
}

export default class HealthService {
  /**
   * Check all service health and return capability flags.
   */
  async check(): Promise<SystemHealth> {
    const services: ServiceHealth[] = await Promise.all([
      this.checkOllama(),
      this.checkQdrant(),
      this.checkFalkorDB(),
      this.checkSidecar(),
      this.checkRedis(),
      this.checkTAK(),
    ])

    const ollamaUp = services.find((s) => s.name === 'ollama')?.status === 'up'
    const qdrantUp = services.find((s) => s.name === 'qdrant')?.status === 'up'
    const falkorUp = services.find((s) => s.name === 'falkordb')?.status === 'up'
    const sidecarUp = services.find((s) => s.name === 'sidecar')?.status === 'up'

    const capabilities = {
      chat: ollamaUp,
      rag: ollamaUp && qdrantUp,
      graphRag: ollamaUp && qdrantUp && falkorUp,
      embedding: ollamaUp,
      zimExtraction: sidecarUp,
      entityExtraction: sidecarUp && ollamaUp,
    }

    // Only count required services (not optional ones) toward overall health
    const optionalNames = ['falkordb', 'sidecar', 'opentakserver']
    const optionalDisabled = services.filter(
      (s) => s.status === 'down' && optionalNames.includes(s.name)
    )
    const requiredDown = services.filter(
      (s) => s.status === 'down' && !optionalDisabled.includes(s)
    )
    let overall: 'healthy' | 'degraded' | 'unhealthy'
    if (requiredDown.length === 0) overall = 'healthy'
    else if (ollamaUp) overall = 'degraded'
    else overall = 'unhealthy'

    return { overall, services, capabilities }
  }

  /**
   * Get a human-readable degradation message for the UI.
   */
  async getDegradationNotice(): Promise<string | null> {
    const health = await this.check()
    if (health.overall === 'healthy') return null

    const down = health.services.filter((s) => s.status === 'down').map((s) => s.name)

    if (down.includes('ollama')) {
      return 'Ollama is not running. AI chat and embedding are unavailable. Start Ollama to enable AI features.'
    }

    const notices: string[] = []
    if (down.includes('qdrant')) {
      notices.push('Vector search is offline — chat will work without RAG context.')
    }
    if (down.includes('falkordb')) {
      notices.push('Knowledge graph is offline — using vector-only retrieval.')
    }
    if (down.includes('sidecar')) {
      notices.push('Python sidecar is offline — ZIM extraction and entity extraction disabled.')
    }

    return notices.length > 0 ? notices.join(' ') : null
  }

  private async checkOllama(): Promise<ServiceHealth> {
    const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
    return this.httpCheck('ollama', `${host}/api/tags`)
  }

  private async checkQdrant(): Promise<ServiceHealth> {
    const host = process.env.QDRANT_HOST || 'http://127.0.0.1:6333'
    return this.httpCheck('qdrant', `${host}/collections`)
  }

  private async checkFalkorDB(): Promise<ServiceHealth> {
    // Always try to connect — the service may have been toggled on from the admin UI
    const host = process.env.FALKORDB_HOST || '127.0.0.1'
    const port = Number(process.env.FALKORDB_PORT) || 6380
    const result = await this.tcpCheck('falkordb', host, port)
    if (result.status === 'down') {
      result.message = 'Not running'
    }
    return result
  }

  private async checkSidecar(): Promise<ServiceHealth> {
    // Always try to connect — the service may have been toggled on from the admin UI
    const url = process.env.SIDECAR_URL || 'http://127.0.0.1:8100'
    const result = await this.httpCheck('sidecar', `${url}/health`)
    if (result.status === 'down') {
      result.message = 'Not running'
    }
    return result
  }

  private async checkTAK(): Promise<ServiceHealth> {
    const result = await this.tcpCheck('opentakserver', '127.0.0.1', 8080)
    if (result.status === 'down') {
      result.message = 'Not running'
    }
    return result
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const host = process.env.REDIS_HOST || '127.0.0.1'
    const port = Number(process.env.REDIS_PORT) || 6379
    return this.tcpCheck('redis', host, port)
  }

  private async httpCheck(name: string, url: string): Promise<ServiceHealth> {
    const start = Date.now()
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      const latencyMs = Date.now() - start

      if (res.ok) {
        return { name, status: 'up', latencyMs }
      }
      return { name, status: 'degraded', latencyMs, message: `HTTP ${res.status}` }
    } catch (error) {
      return {
        name,
        status: 'down',
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }

  private async tcpCheck(name: string, host: string, port: number): Promise<ServiceHealth> {
    const start = Date.now()
    return new Promise((resolve) => {
      const socket = createConnection({ host, port, timeout: 3000 })

      socket.on('connect', () => {
        socket.destroy()
        resolve({ name, status: 'up', latencyMs: Date.now() - start })
      })

      socket.on('timeout', () => {
        socket.destroy()
        resolve({ name, status: 'down', latencyMs: Date.now() - start, message: 'Connection timeout' })
      })

      socket.on('error', (error) => {
        socket.destroy()
        resolve({ name, status: 'down', latencyMs: Date.now() - start, message: error.message })
      })
    })
  }
}
