import { test } from '@japa/runner'
import ContentExtractorService from '#services/content_extractor_service'
import IngestionService from '#services/ingestion_service'
import RetrievalService from '#services/retrieval_service'
import QueryProcessingService from '#services/query_processing_service'
import GraphService from '#services/graph_service'

test.group('Ingestion Services — Unit Tests', () => {
  test('ContentExtractorService instantiates correctly', ({ assert }) => {
    const service = new ContentExtractorService()
    assert.isDefined(service)
    assert.isFunction(service.extract)
    assert.isFunction(service.extractFromBuffer)
    assert.isFunction(service.detectFileTypeFromMime)
  })

  test('ContentExtractorService detects MIME types', ({ assert }) => {
    const service = new ContentExtractorService()
    assert.equal(service.detectFileTypeFromMime('application/pdf'), 'pdf')
    assert.equal(service.detectFileTypeFromMime('text/plain'), 'text')
    assert.equal(service.detectFileTypeFromMime('text/html'), 'html')
    assert.isUndefined(service.detectFileTypeFromMime('application/unknown'))
  })

  test('ContentExtractorService extracts text from buffer', async ({ assert }) => {
    const service = new ContentExtractorService()
    const content = 'Hello, this is a test document with some words.'
    const buffer = Buffer.from(content, 'utf-8')
    const result = await service.extractFromBuffer(buffer, 'test.txt')
    assert.equal(result.text, content)
    assert.equal(result.metadata.fileType, 'text')
    assert.isAbove(result.metadata.wordCount, 0)
  })

  test('ContentExtractorService strips HTML', async ({ assert }) => {
    const service = new ContentExtractorService()
    const html = '<html><body><h1>Title</h1><p>Paragraph text</p></body></html>'
    const buffer = Buffer.from(html, 'utf-8')
    const result = await service.extractFromBuffer(buffer, 'page.html')
    assert.equal(result.metadata.fileType, 'html')
    assert.include(result.text, 'Title')
    assert.include(result.text, 'Paragraph text')
    assert.notInclude(result.text, '<h1>')
  })

  test('ContentExtractorService rejects unsupported types', async ({ assert }) => {
    const service = new ContentExtractorService()
    const buffer = Buffer.from('data', 'utf-8')
    await assert.rejects(
      () => service.extractFromBuffer(buffer, 'file.xyz'),
      /Unsupported file type/
    )
  })

  test('GraphService instantiates with disabled state', ({ assert }) => {
    const service = new GraphService()
    assert.isDefined(service)
    assert.isFunction(service.initialize)
    assert.isFunction(service.addEntity)
    assert.isFunction(service.queryRelated)
    assert.isFunction(service.searchEntities)
  })

  test('GraphService returns empty results when disabled', async ({ assert }) => {
    const service = new GraphService()
    const related = await service.queryRelated('test')
    assert.deepEqual(related, [])
    const search = await service.searchEntities('test')
    assert.deepEqual(search, [])
    assert.isFalse(await service.isAvailable())
  })

  test('IngestionService instantiates correctly', ({ assert }) => {
    const service = new IngestionService()
    assert.isDefined(service)
    assert.isFunction(service.ingestFile)
    assert.isFunction(service.ingestText)
    assert.isFunction(service.reEmbed)
    assert.isFunction(service.deleteSource)
  })

  test('RetrievalService instantiates correctly', ({ assert }) => {
    const service = new RetrievalService()
    assert.isDefined(service)
    assert.isFunction(service.retrieve)
  })

  test('QueryProcessingService instantiates correctly', ({ assert }) => {
    const service = new QueryProcessingService()
    assert.isDefined(service)
    assert.isFunction(service.process)
  })

  test('KnowledgeSource model exists', async ({ assert }) => {
    const { default: KnowledgeSource } = await import('#models/knowledge_source')
    assert.isDefined(KnowledgeSource)
    assert.equal(KnowledgeSource.table, 'knowledge_sources')
  })
})
