import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import OllamaService from '#services/ollama_service'

const manageModel: ToolHandler = {
  name: 'manage_model',
  displayName: 'Manage AI Model',
  description: 'List, pull, or delete Ollama AI models',
  category: 'ai',
  parameters: [
    { name: 'action', type: 'string', description: 'Action: list, pull, or delete', required: true },
    { name: 'model', type: 'string', description: 'Model name (required for pull/delete)', required: false },
  ],
  minimumRole: 'operator',
  requiresConfirmation: false,

  async execute(params: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    const action = params.action as string
    const model = params.model as string | undefined

    const ollama = new OllamaService()
    const available = await ollama.isAvailable()
    if (!available) {
      return { success: false, message: 'Ollama is not available.' }
    }

    switch (action) {
      case 'list': {
        const models = await ollama.listModels()
        return {
          success: true,
          message: `Found ${models.length} installed model(s)`,
          data: { models: models.map((m: { name: string; size: number }) => ({ name: m.name, size: m.size })) },
        }
      }

      case 'pull': {
        if (!model) {
          return { success: false, message: 'Model name is required for pull action' }
        }
        await ollama.pullModel(model)
        return {
          success: true,
          message: `Model "${model}" pulled successfully`,
          data: { model, action: 'pulled' },
        }
      }

      case 'delete': {
        if (!model) {
          return { success: false, message: 'Model name is required for delete action' }
        }
        await ollama.deleteModel(model)
        return {
          success: true,
          message: `Model "${model}" deleted`,
          data: { model, action: 'deleted' },
        }
      }

      default:
        return { success: false, message: `Invalid action "${action}". Use list, pull, or delete.` }
    }
  },
}

export default manageModel
