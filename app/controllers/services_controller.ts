import type { HttpContext } from '@adonisjs/core/http'
import DockerService from '#services/docker_service'
import OllamaService from '#services/ollama_service'
import ModelRole from '#models/model_role'

/**
 * Curated model catalog — popular models grouped by category with size/RAM info.
 */
const MODEL_CATALOG = [
  // Chat / General
  { name: 'qwen2.5:1.5b', category: 'Chat', description: 'Fast, lightweight chat model', sizeGb: 1.0, minRamGb: 8 },
  { name: 'qwen2.5:7b', category: 'Chat', description: 'Balanced performance and quality', sizeGb: 4.4, minRamGb: 16 },
  { name: 'qwen2.5:14b', category: 'Chat', description: 'High quality reasoning', sizeGb: 9.0, minRamGb: 24 },
  { name: 'qwen2.5:32b', category: 'Chat', description: 'Near-frontier quality', sizeGb: 20.0, minRamGb: 48 },
  { name: 'llama3.2:3b', category: 'Chat', description: 'Meta Llama 3.2 — fast and capable', sizeGb: 2.0, minRamGb: 8 },
  { name: 'llama3.1:8b', category: 'Chat', description: 'Meta Llama 3.1 — strong all-rounder', sizeGb: 4.7, minRamGb: 16 },
  { name: 'llama3.3:70b', category: 'Chat', description: 'Meta Llama 3.3 — top tier', sizeGb: 43.0, minRamGb: 64 },
  { name: 'gemma3:4b', category: 'Chat', description: 'Google Gemma 3 — efficient', sizeGb: 3.0, minRamGb: 8 },
  { name: 'gemma3:12b', category: 'Chat', description: 'Google Gemma 3 — balanced', sizeGb: 8.0, minRamGb: 16 },
  { name: 'gemma3:27b', category: 'Chat', description: 'Google Gemma 3 — high quality', sizeGb: 17.0, minRamGb: 32 },
  { name: 'mistral:7b', category: 'Chat', description: 'Mistral 7B — fast European model', sizeGb: 4.1, minRamGb: 16 },
  { name: 'phi4:14b', category: 'Chat', description: 'Microsoft Phi-4 — strong reasoning', sizeGb: 9.1, minRamGb: 24 },
  { name: 'deepseek-r1:8b', category: 'Reasoning', description: 'DeepSeek R1 — chain-of-thought reasoning', sizeGb: 4.9, minRamGb: 16 },
  { name: 'deepseek-r1:32b', category: 'Reasoning', description: 'DeepSeek R1 — advanced reasoning', sizeGb: 20.0, minRamGb: 48 },
  // Embedding
  { name: 'nomic-embed-text', category: 'Embedding', description: 'Required for RAG — 768-dim vectors', sizeGb: 0.3, minRamGb: 8 },
  // Code
  { name: 'qwen2.5-coder:7b', category: 'Code', description: 'Code generation and analysis', sizeGb: 4.4, minRamGb: 16 },
  { name: 'codellama:7b', category: 'Code', description: 'Meta Code Llama', sizeGb: 3.8, minRamGb: 16 },
]

export default class ServicesController {
  /**
   * Show the Docker service management page.
   * GET /services
   */
  async index({ inertia }: HttpContext) {
    const docker = new DockerService()
    const ollama = new OllamaService()
    let containers: Awaited<ReturnType<DockerService['listContainers']>> = []
    let dockerAvailable = false
    let installedModels: string[] = []
    let ollamaAvailable = false
    let modelRoles: { roleName: string; modelName: string }[] = []

    try {
      dockerAvailable = await docker.isAvailable()
      if (dockerAvailable) {
        containers = await docker.listContainers()
      }
    } catch {
      // Docker not available
    }

    try {
      ollamaAvailable = await ollama.isAvailable()
      if (ollamaAvailable) {
        const models = await ollama.listModels()
        installedModels = models.map((m: { name: string }) => m.name)
      }
    } catch { /* Ollama not available */ }

    try {
      const roles = await ModelRole.all()
      modelRoles = roles.map((r) => ({ roleName: r.roleName, modelName: r.modelName }))
    } catch { /* DB might not be ready */ }

    return inertia.render('services' as any, {
      containers,
      dockerAvailable,
      ollamaAvailable,
      installedModels,
      modelCatalog: MODEL_CATALOG,
      modelRoles,
    })
  }

  /**
   * Start a container.
   * POST /api/services/:id/start
   */
  async start({ params, response }: HttpContext) {
    const docker = new DockerService()
    await docker.startContainer(params.id)
    return response.ok({ status: 'started' })
  }

  /**
   * Stop a container.
   * POST /api/services/:id/stop
   */
  async stop({ params, response }: HttpContext) {
    const docker = new DockerService()
    await docker.stopContainer(params.id)
    return response.ok({ status: 'stopped' })
  }

  /**
   * Restart a container.
   * POST /api/services/:id/restart
   */
  async restart({ params, response }: HttpContext) {
    const docker = new DockerService()
    await docker.restartContainer(params.id)
    return response.ok({ status: 'restarted' })
  }

  /**
   * Get container logs.
   * GET /api/services/:id/logs
   */
  async logs({ params, request }: HttpContext) {
    const docker = new DockerService()
    const tail = Number(request.qs().tail) || 100
    const logs = await docker.getContainerLogs(params.id, tail)
    return { logs }
  }

  /**
   * List installed Ollama models.
   * GET /api/models
   */
  async listModels({ response }: HttpContext) {
    const ollama = new OllamaService()
    try {
      const models = await ollama.listModels()
      return response.ok({
        models: models.map((m) => ({
          name: m.name,
          sizeGb: Math.round((m.size / (1024 * 1024 * 1024)) * 10) / 10,
          modifiedAt: String(m.modified_at),
        })),
      })
    } catch {
      return response.serviceUnavailable({ error: 'Ollama is not available' })
    }
  }

  /**
   * Pull (install) an Ollama model — streaming progress.
   * POST /api/models/pull
   */
  async pullModel({ request, response }: HttpContext) {
    const { model } = request.only(['model'])
    if (!model || typeof model !== 'string') {
      return response.badRequest({ error: 'Model name required' })
    }

    const ollama = new OllamaService()
    if (!(await ollama.isAvailable())) {
      return response.serviceUnavailable({ error: 'Ollama is not running' })
    }

    response.response.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    try {
      for await (const progress of ollama.pullModel(model)) {
        response.response.write(JSON.stringify(progress) + '\n')
      }
      response.response.write(JSON.stringify({ status: 'success', done: true }) + '\n')
    } catch (err) {
      response.response.write(
        JSON.stringify({ status: 'error', error: err instanceof Error ? err.message : 'Pull failed' }) + '\n'
      )
    }
    response.response.end()
  }

  /**
   * Delete an Ollama model.
   * DELETE /api/models/:name
   */
  async deleteModel({ params, response }: HttpContext) {
    const ollama = new OllamaService()
    try {
      await ollama.deleteModel(params.name)
      return response.ok({ deleted: true })
    } catch (err) {
      return response.badRequest({ error: err instanceof Error ? err.message : 'Delete failed' })
    }
  }

  /**
   * Assign a model to a role (chat, embedding, etc.)
   * POST /api/models/assign
   */
  async assignRole({ request, response }: HttpContext) {
    const { roleName, modelName } = request.only(['roleName', 'modelName'])
    if (!roleName || !modelName) {
      return response.badRequest({ error: 'roleName and modelName required' })
    }

    const existing = await ModelRole.findBy('roleName', roleName)
    if (existing) {
      existing.modelName = modelName
      await existing.save()
    } else {
      await ModelRole.create({ roleName, modelName, isDefault: true })
    }

    return response.ok({ roleName, modelName })
  }
}
