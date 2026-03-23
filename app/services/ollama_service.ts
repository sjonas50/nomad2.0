import { Ollama } from 'ollama'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatOptions {
  numCtx?: number
  systemPrompt?: string
}

interface PullProgress {
  status: string
  completed?: number
  total?: number
}

export default class OllamaService {
  private client: Ollama
  private mutex: Promise<void> = Promise.resolve()

  constructor() {
    this.client = new Ollama({
      host: env.get('OLLAMA_HOST', 'http://localhost:11434'),
    })
  }

  /**
   * Simple promise-chain mutex for request serialization.
   * Prevents model swap thrashing on CPU hardware.
   */
  private acquireMutex(): { release: () => void; ready: Promise<void> } {
    let release!: () => void
    const next = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = this.mutex
    this.mutex = this.mutex.then(() => next)
    return { release, ready }
  }

  /**
   * Streaming chat completion. Returns an AsyncGenerator yielding
   * objects with content and optional thinking flag.
   */
  async *chatStream(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<{ content: string; thinking: boolean }> {
    const { release, ready } = this.acquireMutex()
    await ready
    try {
      const allMessages = options?.systemPrompt
        ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
        : messages

      const stream = await this.client.chat({
        model,
        messages: allMessages,
        stream: true,
        options: options?.numCtx ? { num_ctx: options.numCtx } : undefined,
      })

      for await (const part of stream) {
        yield {
          content: part.message.content,
          thinking: false,
        }
      }
    } finally {
      release()
    }
  }

  /**
   * Non-streaming chat completion. Returns the full response string.
   */
  async chat(
    model: string,
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<string> {
    const { release, ready } = this.acquireMutex()
    await ready
    try {
      const allMessages = options?.systemPrompt
        ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
        : messages

      const response = await this.client.chat({
        model,
        messages: allMessages,
        options: options?.numCtx ? { num_ctx: options.numCtx } : undefined,
      })

      return response.message.content
    } finally {
      release()
    }
  }

  /**
   * Batch embedding via ollama.embed(). Uses keep_alive: -1 to pin the
   * embedding model in memory.
   */
  async embed(model: string, texts: string[]): Promise<number[][]> {
    const { release, ready } = this.acquireMutex()
    await ready
    try {
      const result = await this.client.embed({
        model,
        input: texts,
        keep_alive: -1,
      })
      return result.embeddings
    } finally {
      release()
    }
  }

  /**
   * Pull a model with streaming progress. Returns an AsyncGenerator
   * yielding progress objects.
   */
  async *pullModel(model: string): AsyncGenerator<PullProgress> {
    const { release, ready } = this.acquireMutex()
    await ready
    try {
      logger.info(`Pulling model: ${model}`)
      const stream = await this.client.pull({ model, stream: true })

      for await (const progress of stream) {
        yield {
          status: progress.status,
          completed: progress.completed,
          total: progress.total,
        }
      }

      logger.info(`Model pulled: ${model}`)
    } finally {
      release()
    }
  }

  /**
   * List all locally available models.
   * Does NOT acquire the mutex — read-only and lightweight.
   */
  async listModels() {
    const { models } = await this.client.list()
    return models
  }

  /**
   * Show model details including num_ctx and parameter size.
   */
  async showModel(model: string) {
    const { release, ready } = this.acquireMutex()
    await ready
    try {
      return await this.client.show({ model })
    } finally {
      release()
    }
  }

  /**
   * Delete a model from local storage.
   */
  async deleteModel(model: string): Promise<void> {
    const { release, ready } = this.acquireMutex()
    await ready
    try {
      logger.info(`Deleting model: ${model}`)
      await this.client.delete({ model })
      logger.info(`Model deleted: ${model}`)
    } finally {
      release()
    }
  }

  /**
   * Health check — returns true if Ollama is reachable.
   * Does NOT acquire the mutex.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.list()
      return true
    } catch {
      return false
    }
  }
}
