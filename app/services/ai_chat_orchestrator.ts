import OllamaService from '#services/ollama_service'
import EmbeddingService from '#services/embedding_service'
import VectorStoreService from '#services/vector_store_service'
import ToolRegistry from '#services/tool_registry'
import ChatSession from '#models/chat_session'
import ChatMessage from '#models/chat_message'
import ModelRole from '#models/model_role'
import type { UserRole } from '#models/user'

// Built-in tools
import searchKnowledgeBase from '#tools/search_knowledge_base'
import installService from '#tools/install_service'
import downloadContent from '#tools/download_content'
import systemDiagnostics from '#tools/system_diagnostics'
import manageModel from '#tools/manage_model'

interface ChatRequest {
  sessionId?: number
  message: string
  userId: number
  userRole?: UserRole
}

interface StreamChunk {
  type: 'token' | 'thinking' | 'sources' | 'done' | 'error' | 'session' | 'tool_result'
  content: string
  metadata?: Record<string, unknown>
}

const DEFAULT_MODEL = 'qwen2.5:1.5b'
const CLASSIFIER_MODEL = 'qwen2.5:1.5b'
const HISTORY_TURNS = 10

export default class AIChatOrchestrator {
  private ollama: OllamaService
  private embedding: EmbeddingService
  private vectorStore: VectorStoreService
  private toolRegistry: ToolRegistry

  constructor(
    ollama?: OllamaService,
    embedding?: EmbeddingService,
    vectorStore?: VectorStoreService
  ) {
    this.ollama = ollama ?? new OllamaService()
    this.embedding = embedding ?? new EmbeddingService(this.ollama)
    this.vectorStore = vectorStore ?? new VectorStoreService()
    this.toolRegistry = new ToolRegistry()
    this.registerBuiltinTools()
  }

  private registerBuiltinTools(): void {
    this.toolRegistry.register(searchKnowledgeBase)
    this.toolRegistry.register(installService)
    this.toolRegistry.register(downloadContent)
    this.toolRegistry.register(systemDiagnostics)
    this.toolRegistry.register(manageModel)
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry
  }

  /**
   * Process a chat request and return a ReadableStream of ndjson chunks.
   */
  async processChat(request: ChatRequest): Promise<ReadableStream<Uint8Array>> {
    const encoder = new TextEncoder()
    const self = this

    return new ReadableStream({
      async start(controller) {
        try {
          // 1. Get or create session
          const session = await self.getOrCreateSession(request)
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'session',
                content: '',
                metadata: { sessionId: session.id, title: session.title },
              } satisfies StreamChunk) + '\n'
            )
          )

          // 2. Persist user message
          await ChatMessage.create({
            chatSessionId: session.id,
            role: 'user',
            content: request.message,
          })

          // 3. Classify intent
          const intent = await self.classifyIntent(request.message)

          // 3b. If tool intent, try to extract and execute a tool call
          if (intent === 'tool') {
            const toolResult = await self.handleToolIntent(request)
            if (toolResult) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'tool_result',
                    content: toolResult.message,
                    metadata: {
                      success: toolResult.success,
                      data: toolResult.data,
                      requiresConfirmation: toolResult.requiresConfirmation,
                      confirmationMessage: toolResult.confirmationMessage,
                    },
                  } satisfies StreamChunk) + '\n'
                )
              )
            }
          }

          // 4. Retrieve context if it's a question/search
          let contextBlocks: string[] = []
          let sources: Array<Record<string, unknown>> = []
          if (intent === 'question' || intent === 'search') {
            const retrieval = await self.retrieveContext(request.message)
            contextBlocks = retrieval.contexts
            sources = retrieval.sources

            if (sources.length > 0) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'sources',
                    content: '',
                    metadata: { sources },
                  } satisfies StreamChunk) + '\n'
                )
              )
            }
          }

          // 5. Load conversation history
          const history = await self.loadHistory(session.id)

          // 6. Get model config
          const modelConfig = await self.getModelConfig('general')
          const model = modelConfig.modelName || DEFAULT_MODEL

          // 7. Assemble messages
          const toolDesc = self.toolRegistry.describeForLLM(request.userRole || 'viewer')
          const messages = self.assembleMessages(
            modelConfig.systemPrompt,
            history,
            request.message,
            contextBlocks,
            toolDesc
          )

          // 8. Stream generation
          let fullResponse = ''
          let thinkingContent = ''
          const stream = self.ollama.chatStream(
            model,
            messages as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
            { numCtx: modelConfig.numCtx }
          )

          for await (const chunk of stream) {
            if (chunk.thinking) {
              thinkingContent += chunk.content
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'thinking',
                    content: chunk.content,
                  } satisfies StreamChunk) + '\n'
                )
              )
            } else {
              fullResponse += chunk.content
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'token',
                    content: chunk.content,
                  } satisfies StreamChunk) + '\n'
                )
              )
            }
          }

          // 9. Persist assistant message
          await ChatMessage.create({
            chatSessionId: session.id,
            role: 'assistant',
            content: fullResponse,
            thinkingContent: thinkingContent || null,
            sources: sources.length > 0 ? sources : null,
            metadata: { model, intent },
          })

          // 10. Update session title if first exchange
          if (!session.title && fullResponse) {
            await self.generateSessionTitle(session, request.message)
          }

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'done',
                content: '',
                metadata: { model, intent },
              } satisfies StreamChunk) + '\n'
            )
          )
          controller.close()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                content: message,
              } satisfies StreamChunk) + '\n'
            )
          )
          controller.close()
        }
      },
    })
  }

  private async getOrCreateSession(request: ChatRequest): Promise<ChatSession> {
    if (request.sessionId) {
      const session = await ChatSession.query()
        .where('id', request.sessionId)
        .where('userId', request.userId)
        .firstOrFail()
      return session
    }

    return await ChatSession.create({
      userId: request.userId,
      modelName: DEFAULT_MODEL,
    })
  }

  private async classifyIntent(message: string): Promise<string> {
    try {
      const response = await this.ollama.chat(CLASSIFIER_MODEL, [
        {
          role: 'system',
          content:
            'Classify the user message into one category: question, search, tool, or chat.\n' +
            '- "tool" = the user wants to perform an action (install, download, check status, manage models, run diagnostics)\n' +
            '- "question" = the user is asking about information in their knowledge base\n' +
            '- "search" = the user wants to find specific content\n' +
            '- "chat" = general conversation\n' +
            'Respond with ONLY the category word.',
        },
        { role: 'user', content: message },
      ])
      const intent = response.trim().toLowerCase()
      if (['question', 'search', 'tool', 'chat'].includes(intent)) {
        return intent
      }
      return 'chat'
    } catch {
      return 'chat'
    }
  }

  private async handleToolIntent(
    request: ChatRequest
  ): Promise<{ success: boolean; message: string; data?: Record<string, unknown>; requiresConfirmation?: boolean; confirmationMessage?: string } | null> {
    const userRole = request.userRole || 'viewer'
    const availableTools = this.toolRegistry.list(userRole)
    if (availableTools.length === 0) return null

    // Use LLM to extract tool call from natural language
    const toolDescriptions = this.toolRegistry.describeForLLM(userRole)
    try {
      const response = await this.ollama.chat(CLASSIFIER_MODEL, [
        {
          role: 'system',
          content:
            `You are a tool router. Given a user message, extract the tool call as JSON.\n\n${toolDescriptions}\n\n` +
            'Respond with ONLY valid JSON: {"tool": "tool_name", "params": {}}. If no tool matches, respond with {"tool": null}.',
        },
        { role: 'user', content: request.message },
      ])

      const parsed = JSON.parse(response.trim())
      if (!parsed.tool) return null

      return this.toolRegistry.execute(parsed.tool, parsed.params || {}, {
        userId: request.userId,
        userRole,
      })
    } catch {
      return null
    }
  }

  private async retrieveContext(
    query: string
  ): Promise<{ contexts: string[]; sources: Array<Record<string, unknown>> }> {
    try {
      const queryVector = await this.embedding.embedQuery(query)
      const results = await this.vectorStore.search(queryVector, undefined, 5)

      const contexts: string[] = []
      const sources: Array<Record<string, unknown>> = []

      for (const result of results) {
        const content = result.payload?.content as string
        if (content) {
          contexts.push(content)
          sources.push({
            id: result.id,
            score: result.score,
            source: result.payload?.source,
            title: result.payload?.title,
          })
        }
      }

      return { contexts, sources }
    } catch {
      return { contexts: [], sources: [] }
    }
  }

  private async loadHistory(
    sessionId: number
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await ChatMessage.query()
      .where('chatSessionId', sessionId)
      .orderBy('createdAt', 'desc')
      .limit(HISTORY_TURNS * 2)

    return messages
      .reverse()
      .map((m) => ({ role: m.role, content: m.content }))
  }

  private async getModelConfig(
    roleName: string
  ): Promise<{ modelName: string; systemPrompt: string | null; numCtx: number }> {
    try {
      const role = await ModelRole.query().where('roleName', roleName).first()
      if (role) {
        const options = (role.options as Record<string, unknown>) || {}
        return {
          modelName: role.modelName,
          systemPrompt: role.systemPrompt,
          numCtx: (options.num_ctx as number) || 4096,
        }
      }
    } catch {
      // Table may not exist yet
    }
    return {
      modelName: DEFAULT_MODEL,
      systemPrompt:
        'You are The Attic AI, a helpful knowledge assistant. Answer questions clearly and cite your sources when available.',
      numCtx: 4096,
    }
  }

  private assembleMessages(
    systemPrompt: string | null,
    history: Array<{ role: string; content: string }>,
    userMessage: string,
    contextBlocks: string[],
    toolDescriptions?: string
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = []

    // System prompt
    let system = systemPrompt || 'You are The Attic AI, a helpful knowledge assistant.'
    if (toolDescriptions) {
      system += '\n\n' + toolDescriptions
    }
    if (contextBlocks.length > 0) {
      system +=
        '\n\nUse the following retrieved context to answer. Cite sources by [number].\n\n' +
        contextBlocks.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')
    }
    messages.push({ role: 'system', content: system })

    // History
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content })
    }

    // Current message
    messages.push({ role: 'user', content: userMessage })

    return messages
  }

  private async generateSessionTitle(session: ChatSession, firstMessage: string): Promise<void> {
    try {
      const title = await this.ollama.chat(CLASSIFIER_MODEL, [
        {
          role: 'system',
          content:
            'Generate a short title (max 6 words) for a chat that starts with the following message. Respond with ONLY the title, no quotes.',
        },
        { role: 'user', content: firstMessage },
      ])
      session.title = title.trim().slice(0, 100)
      await session.save()
    } catch {
      // Title generation is best-effort
    }
  }
}
