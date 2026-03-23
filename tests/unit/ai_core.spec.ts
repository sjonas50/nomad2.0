import { test } from '@japa/runner'
import ChunkingService from '#services/chunking_service'
import EmbeddingService from '#services/embedding_service'
import OllamaService from '#services/ollama_service'
import VectorStoreService from '#services/vector_store_service'
import AIChatOrchestrator from '#services/ai_chat_orchestrator'

test.group('AI Core Services — Unit Tests', () => {
  test('OllamaService instantiates without errors', ({ assert }) => {
    const service = new OllamaService()
    assert.isDefined(service)
    assert.isFunction(service.chatStream)
    assert.isFunction(service.chat)
    assert.isFunction(service.embed)
    assert.isFunction(service.pullModel)
    assert.isFunction(service.listModels)
    assert.isFunction(service.showModel)
    assert.isFunction(service.deleteModel)
    assert.isFunction(service.isAvailable)
  })

  test('VectorStoreService instantiates without errors', ({ assert }) => {
    const service = new VectorStoreService()
    assert.isDefined(service)
    assert.isFunction(service.ensureCollection)
    assert.isFunction(service.upsert)
    assert.isFunction(service.search)
    assert.isFunction(service.deleteByFilter)
    assert.isFunction(service.collectionInfo)
    assert.isFunction(service.isAvailable)
  })

  test('EmbeddingService instantiates without errors', ({ assert }) => {
    const service = new EmbeddingService()
    assert.isDefined(service)
    assert.isFunction(service.embedDocument)
    assert.isFunction(service.embedQuery)
    assert.isFunction(service.embedDocuments)
    assert.isFunction(service.ensureModel)
  })

  test('ChunkingService handles empty text', ({ assert }) => {
    const service = new ChunkingService()
    const chunks = service.chunkText('')
    // Empty string after trim produces empty array or single empty chunk
    assert.isArray(chunks)
  })

  test('ChunkingService structured chunking with nested headings', ({ assert }) => {
    const md = `# Title

Intro paragraph.

## Section A

Content for section A with enough text to test chunking.

### Subsection A.1

More detailed content here.

## Section B

Final section content.`

    const service = new ChunkingService()
    const chunks = service.chunkStructured(md)
    assert.isAbove(chunks.length, 0)
    // Verify all chunks have valid indexes
    const indexes = chunks.map((c) => c.index)
    for (let i = 0; i < indexes.length; i++) {
      assert.equal(indexes[i], i)
    }
  })

  test('AIChatOrchestrator instantiates without errors', ({ assert }) => {
    const orchestrator = new AIChatOrchestrator()
    assert.isDefined(orchestrator)
    assert.isFunction(orchestrator.processChat)
  })

  test('ChatSession model exists', async ({ assert }) => {
    const { default: ChatSession } = await import('#models/chat_session')
    assert.isDefined(ChatSession)
    assert.equal(ChatSession.table, 'chat_sessions')
  })

  test('ChatMessage model exists', async ({ assert }) => {
    const { default: ChatMessage } = await import('#models/chat_message')
    assert.isDefined(ChatMessage)
    assert.equal(ChatMessage.table, 'chat_messages')
  })

  test('ModelRole model exists', async ({ assert }) => {
    const { default: ModelRole } = await import('#models/model_role')
    assert.isDefined(ModelRole)
    assert.equal(ModelRole.table, 'model_roles')
  })
})
