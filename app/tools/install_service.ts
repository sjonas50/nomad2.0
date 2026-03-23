import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import DockerService from '#services/docker_service'

const installService: ToolHandler = {
  name: 'install_service',
  displayName: 'Install Service',
  description: 'Start or restart a Docker service by container name or ID',
  category: 'services',
  parameters: [
    { name: 'containerId', type: 'string', description: 'Docker container ID or name', required: true },
    { name: 'action', type: 'string', description: 'Action: start, stop, or restart', required: true },
  ],
  minimumRole: 'operator',
  requiresConfirmation: true,

  async execute(params: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const containerId = params.containerId as string
    const action = params.action as string

    if (!['start', 'stop', 'restart'].includes(action)) {
      return { success: false, message: `Invalid action "${action}". Use start, stop, or restart.` }
    }

    try {
      const docker = new DockerService()
      const available = await docker.isAvailable()
      if (!available) {
        return { success: false, message: 'Docker is not available on this machine.' }
      }

      switch (action) {
        case 'start':
          await docker.startContainer(containerId)
          break
        case 'stop':
          await docker.stopContainer(containerId)
          break
        case 'restart':
          await docker.restartContainer(containerId)
          break
      }

      return {
        success: true,
        message: `Successfully ${action}ed container "${containerId}"`,
        data: { containerId, action },
      }
    } catch (error) {
      return {
        success: false,
        message: `Docker ${action} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  },
}

export default installService
