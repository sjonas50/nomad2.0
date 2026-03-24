import type { HttpContext } from '@adonisjs/core/http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import HealthService from '#services/health_service'
import OllamaService from '#services/ollama_service'
import KnowledgeSource from '#models/knowledge_source'
import logger from '@adonisjs/core/services/logger'

const execFileAsync = promisify(execFile)

const REQUIRED_SERVICES = ['ollama', 'qdrant', 'redis']
const OPTIONAL_SERVICES = ['falkordb', 'sidecar', 'opentakserver']

const SERVICE_PROFILES: Record<string, { profiles: string[]; container: string; description: string }> = {
  falkordb: {
    profiles: ['full', 'graph'],
    container: 'attic_falkordb',
    description: 'Knowledge graph database for entity relationships (16GB+ RAM recommended)',
  },
  sidecar: {
    profiles: ['full', 'zim'],
    container: 'attic_sidecar',
    description: 'Python service for ZIM extraction, entity extraction, and voice transcription',
  },
  opentakserver: {
    profiles: ['full', 'tak'],
    container: 'attic_tak',
    description: 'CoT bridge for ATAK/iTAK interoperability',
  },
}

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
   * API: enable/disable an optional service (start/stop Docker container)
   */
  async toggleService({ request, response }: HttpContext) {
    const { service, enable } = request.only(['service', 'enable'])

    if (!service || typeof service !== 'string') {
      return response.badRequest({ error: 'Service name required' })
    }

    const config = SERVICE_PROFILES[service]
    if (!config) {
      return response.badRequest({ error: `Unknown optional service: ${service}` })
    }

    try {
      if (enable) {
        // Try to start the service using its profile
        const profile = config.profiles[0]
        logger.info({ service, profile }, 'Starting optional service')

        // Try production compose first, fall back to dev compose
        const composeFiles = ['docker-compose.yml', 'docker-compose.prod.yml']
        let started = false

        for (const file of composeFiles) {
          try {
            await execFileAsync('docker', [
              'compose', '-f', file,
              '--profile', profile,
              'up', '-d', service,
            ], { timeout: 60_000 })
            started = true
            break
          } catch {
            // Try next compose file
          }
        }

        if (!started) {
          return response.unprocessableEntity({
            error: `Could not start ${service}. Make sure Docker is running and the compose file is available.`,
            hint: `Run manually: docker compose --profile ${profile} up -d ${service}`,
          })
        }

        // Wait for container to be healthy (up to 30s)
        let healthy = false
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000))
          try {
            const { stdout } = await execFileAsync('docker', [
              'inspect', '--format', '{{.State.Health.Status}}', config.container,
            ])
            if (stdout.trim() === 'healthy') {
              healthy = true
              break
            }
          } catch {
            // Container may not exist yet
          }
        }

        return response.ok({
          service,
          enabled: true,
          healthy,
          message: healthy
            ? `${service} is running and healthy`
            : `${service} started but may still be initializing`,
        })
      } else {
        // Stop the service
        logger.info({ service }, 'Stopping optional service')
        try {
          await execFileAsync('docker', ['stop', config.container], { timeout: 30_000 })
          await execFileAsync('docker', ['rm', config.container], { timeout: 10_000 })
        } catch {
          // Container may not exist
        }

        return response.ok({ service, enabled: false, message: `${service} stopped` })
      }
    } catch (err) {
      logger.error({ err, service }, 'Failed to toggle optional service')
      return response.internalServerError({
        error: `Failed to ${enable ? 'start' : 'stop'} ${service}`,
      })
    }
  }

  /**
   * API: dismiss onboarding
   */
  async dismiss({ response }: HttpContext) {
    return response.ok({ dismissed: true })
  }
}
