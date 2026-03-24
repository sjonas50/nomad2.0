import type { HttpContext } from '@adonisjs/core/http'
import DockerService from '#services/docker_service'
import OllamaService from '#services/ollama_service'
import ModelRole from '#models/model_role'
import { MODEL_CATALOG } from '#config/models'

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
