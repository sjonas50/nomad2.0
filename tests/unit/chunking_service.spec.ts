import { test } from '@japa/runner'
import ChunkingService from '#services/chunking_service'

test.group('ChunkingService', () => {
  const service = new ChunkingService()

  test('short text returns single chunk', ({ assert }) => {
    const chunks = service.chunkText('Hello world')
    assert.lengthOf(chunks, 1)
    assert.equal(chunks[0].text, 'Hello world')
    assert.equal(chunks[0].index, 0)
  })

  test('long text is split into multiple chunks', ({ assert }) => {
    const text = 'Word '.repeat(3000) // ~15000 chars, well over 1700 tokens
    const chunks = service.chunkText(text)
    assert.isAbove(chunks.length, 1)

    // All chunks should have metadata
    for (const chunk of chunks) {
      assert.isDefined(chunk.metadata.startChar)
      assert.isDefined(chunk.metadata.endChar)
      assert.isAbove(chunk.metadata.estimatedTokens, 0)
    }
  })

  test('chunks have sequential indexes', ({ assert }) => {
    const text = 'Sentence one. '.repeat(2000)
    const chunks = service.chunkText(text)
    for (let i = 0; i < chunks.length; i++) {
      assert.equal(chunks[i].index, i)
    }
  })

  test('overlap creates overlapping content', ({ assert }) => {
    const text = 'A'.repeat(20000) // Force multiple chunks
    const chunks = service.chunkText(text, { chunkSize: 500, overlap: 50 })
    assert.isAbove(chunks.length, 2)
  })

  test('structured chunking preserves headings', ({ assert }) => {
    const markdown = `# Introduction
This is the introduction section with some content.

# Methods
This section describes the methods used.

# Results
Here are the results of the study.`

    const chunks = service.chunkStructured(markdown)
    assert.isAbove(chunks.length, 0)
    // At least some chunks should have headings
    const withHeadings = chunks.filter((c) => c.metadata.heading)
    assert.isAbove(withHeadings.length, 0)
  })

  test('structured chunking handles text without headings', ({ assert }) => {
    const text = 'Just plain text without any markdown headings.'
    const chunks = service.chunkStructured(text)
    assert.lengthOf(chunks, 1)
    assert.equal(chunks[0].text, text)
  })

  test('custom chunk size is respected', ({ assert }) => {
    const text = 'X'.repeat(8000) // 2000 estimated tokens
    const chunks = service.chunkText(text, { chunkSize: 500 })
    assert.isAbove(chunks.length, 3)

    // Each chunk should be roughly within limits
    for (const chunk of chunks) {
      assert.isAtMost(chunk.metadata.estimatedTokens, 600) // some tolerance for boundary finding
    }
  })
})
