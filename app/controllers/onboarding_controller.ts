import type { HttpContext } from '@adonisjs/core/http'
import HealthService from '#services/health_service'
import OllamaService from '#services/ollama_service'
import KnowledgeSource from '#models/knowledge_source'

const REQUIRED_SERVICES = ['ollama', 'qdrant', 'redis']
const OPTIONAL_SERVICES = ['falkordb', 'sidecar']

export default class OnboardingController {
  /**
   * Render the onboarding page (Inertia)
   */
  async index({ inertia }: HttpContext) {
    return inertia.render('onboarding' as any, {})
  }

  /**
   * API: return full onboarding status
   */
  async status({ response }: HttpContext) {
    const health = new HealthService()
    const ollama = new OllamaService()

    // Check services
    const systemHealth = await health.check()

    // Split services into required vs optional
    const requiredServices = systemHealth.services
      .filter((s) => REQUIRED_SERVICES.includes(s.name))
      .map((s) => ({ name: s.name, status: s.status, message: s.message || null, required: true }))

    const optionalServices = systemHealth.services
      .filter((s) => OPTIONAL_SERVICES.includes(s.name))
      .map((s) => ({ name: s.name, status: s.status, message: s.message || null, required: false }))

    const coreServicesReady = requiredServices.every((s) => s.status === 'up')

    // Check models
    let models: string[] = []
    let embeddingModel: string | null = null
    let chatModel: string | null = null
    let ollamaUp = false
    try {
      const list = await ollama.listModels()
      models = list.map((m: { name: string }) => m.name)
      ollamaUp = true
      embeddingModel = models.find((m) => m.startsWith('nomic-embed')) || null
      chatModel =
        models.find(
          (m) =>
            m.startsWith('qwen') ||
            m.startsWith('llama') ||
            m.startsWith('mistral') ||
            m.startsWith('gemma') ||
            m.startsWith('phi')
        ) || null
    } catch {
      // Ollama not available
    }

    // Check knowledge
    let knowledgeCount = 0
    try {
      const result = await KnowledgeSource.query().count('* as total').first()
      knowledgeCount = Number(result?.$extras.total ?? 0)
    } catch {
      // DB might not be ready
    }

    // Build steps
    const steps = [
      {
        id: 'services',
        title: 'Core Services',
        description: 'Ollama, Qdrant, and Redis must be running',
        status: coreServicesReady ? ('complete' as const) : ('pending' as const),
        services: requiredServices,
        optionalServices,
      },
      {
        id: 'embedding_model',
        title: 'Embedding Model',
        description: 'Converts your documents into searchable vectors',
        status: embeddingModel ? ('complete' as const) : ('pending' as const),
        model: embeddingModel,
        modelName: 'nomic-embed-text',
        ollamaUp,
      },
      {
        id: 'chat_model',
        title: 'Chat Model',
        description: 'The AI brain that answers your questions',
        status: chatModel ? ('complete' as const) : ('pending' as const),
        model: chatModel,
        modelName: 'qwen2.5:1.5b',
        ollamaUp,
      },
      {
        id: 'knowledge',
        title: 'Add Knowledge',
        description: 'Give the AI documents to reference when answering',
        status: knowledgeCount > 0 ? ('complete' as const) : ('pending' as const),
        count: knowledgeCount,
      },
    ]

    const allComplete = steps.every((s) => s.status === 'complete')

    return response.ok({ steps, models, allComplete })
  }

  /**
   * API: pull an Ollama model (streaming progress)
   */
  async pullModel({ request, response }: HttpContext) {
    const { model } = request.only(['model'])
    if (!model || typeof model !== 'string') {
      return response.badRequest({ error: 'Model name required' })
    }

    const ollama = new OllamaService()

    // Check Ollama is available
    const available = await ollama.isAvailable()
    if (!available) {
      return response.serviceUnavailable({ error: 'Ollama is not running' })
    }

    // Stream pull progress as ndjson
    response.response.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    try {
      for await (const progress of ollama.pullModel(model)) {
        const line = JSON.stringify(progress) + '\n'
        response.response.write(line)
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
   * API: dismiss onboarding
   */
  async dismiss({ response }: HttpContext) {
    return response.ok({ dismissed: true })
  }
}
