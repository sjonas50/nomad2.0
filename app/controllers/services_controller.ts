import type { HttpContext } from '@adonisjs/core/http'
import DockerService from '#services/docker_service'

export default class ServicesController {
  /**
   * Show the Docker service management page.
   * GET /services
   */
  async index({ inertia }: HttpContext) {
    const docker = new DockerService()
    let containers: Awaited<ReturnType<DockerService['listContainers']>> = []
    let dockerAvailable = false

    try {
      dockerAvailable = await docker.isAvailable()
      if (dockerAvailable) {
        containers = await docker.listContainers()
      }
    } catch {
      // Docker not available
    }

    return inertia.render('services' as any, { containers, dockerAvailable })
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
}
