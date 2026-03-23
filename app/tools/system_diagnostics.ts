import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import OllamaService from '#services/ollama_service'
import DockerService from '#services/docker_service'
import VectorStoreService from '#services/vector_store_service'
import os from 'node:os'

const systemDiagnostics: ToolHandler = {
  name: 'system_diagnostics',
  displayName: 'System Diagnostics',
  description: 'Check system health: Ollama, Docker, Qdrant, memory, and disk status',
  category: 'system',
  parameters: [],
  minimumRole: 'viewer',
  requiresConfirmation: false,

  async execute(_params: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const diagnostics: Record<string, unknown> = {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemoryGb: (os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
      freeMemoryGb: (os.freemem() / 1024 / 1024 / 1024).toFixed(1),
      uptime: `${(os.uptime() / 3600).toFixed(1)} hours`,
    }

    // Check Ollama
    try {
      const ollama = new OllamaService()
      diagnostics.ollamaAvailable = await ollama.isAvailable()
      if (diagnostics.ollamaAvailable) {
        const models = await ollama.listModels()
        diagnostics.ollamaModels = models.map((m: { name: string }) => m.name)
      }
    } catch {
      diagnostics.ollamaAvailable = false
    }

    // Check Docker
    try {
      const docker = new DockerService()
      diagnostics.dockerAvailable = await docker.isAvailable()
      if (diagnostics.dockerAvailable) {
        const containers = await docker.listContainers()
        diagnostics.dockerContainers = containers.length
        diagnostics.runningContainers = containers.filter(
          (c: { state: string }) => c.state === 'running'
        ).length
      }
    } catch {
      diagnostics.dockerAvailable = false
    }

    // Check Qdrant
    try {
      const vectorStore = new VectorStoreService()
      await vectorStore.ensureCollection()
      diagnostics.qdrantAvailable = true
    } catch {
      diagnostics.qdrantAvailable = false
    }

    const allHealthy =
      diagnostics.ollamaAvailable && diagnostics.dockerAvailable && diagnostics.qdrantAvailable

    return {
      success: true,
      message: allHealthy
        ? 'All systems operational'
        : 'Some services are unavailable — check diagnostics data',
      data: diagnostics,
    }
  },
}

export default systemDiagnostics
