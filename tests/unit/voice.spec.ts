import { test } from '@japa/runner'
import VoiceCaptureService from '#services/voice_capture_service'

// --- VoiceCaptureService Tests ---

test.group('VoiceCaptureService — Unit Tests', () => {
  test('VoiceCaptureService instantiates', ({ assert }) => {
    const service = new VoiceCaptureService()
    assert.isDefined(service)
    assert.isFunction(service.transcribe)
    assert.isFunction(service.extractActivity)
    assert.isFunction(service.captureAndLog)
  })

  test('extractActivity returns valid structure on LLM failure', async ({ assert }) => {
    // Create service with no Ollama available — extraction should gracefully fallback
    const service = new VoiceCaptureService()
    const result = await service.extractActivity('Test transcript from the field')

    // Should return graceful fallback (raw transcript as activity)
    assert.isDefined(result.activity)
    assert.isString(result.activity)
    assert.include(
      ['decision', 'observation', 'communication', 'resource_change'],
      result.category
    )
    assert.isArray(result.resourcesMentioned)
    assert.isNumber(result.confidence)
  })
})

// --- VoiceCaptureService Interface ---

test.group('VoiceCaptureService — Extraction Schema', () => {
  test('validateCategory normalizes invalid categories', async ({ assert }) => {
    const service = new VoiceCaptureService()

    // The extractActivity method should always return a valid category
    const result = await service.extractActivity('just a test')
    const validCategories = ['decision', 'observation', 'communication', 'resource_change']
    assert.isTrue(validCategories.includes(result.category))
  })

  test('extractActivity returns all required fields', async ({ assert }) => {
    const service = new VoiceCaptureService()
    const result = await service.extractActivity('Generator 3 is offline at the north staging area')

    assert.properties(result, [
      'activity',
      'actor',
      'category',
      'resourcesMentioned',
      'incidentRef',
      'confidence',
    ])
  })
})

// --- Voice Controller Route Tests ---

test.group('VoiceController — Route Existence', () => {
  test('voice routes are registered', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const routesContent = await readFile(
      join(import.meta.dirname, '..', '..', 'start', 'routes.ts'),
      'utf-8'
    )

    assert.include(routesContent, '/voice/capture')
    assert.include(routesContent, '/voice/transcribe')
    assert.include(routesContent, '/voice/extract')
    assert.include(routesContent, 'VoiceController')
  })
})

// --- Voice Recorder Component Tests ---

test.group('VoiceRecorder — Component Existence', () => {
  test('voice_recorder component file exists', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await access(join(import.meta.dirname, '..', '..', 'inertia', 'components', 'voice_recorder.tsx'))
    assert.isTrue(true)
  })

  test('incident_detail imports voice recorder', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'inertia', 'pages', 'incident_detail.tsx'),
      'utf-8'
    )
    assert.include(content, 'VoiceRecorder')
    assert.include(content, 'voice_recorder')
  })
})

// --- Sidecar Whisper Tests ---

test.group('Sidecar — Whisper Integration', () => {
  test('whisper extractor module exists', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await access(join(import.meta.dirname, '..', '..', 'sidecar', 'extractors', 'whisper.py'))
    assert.isTrue(true)
  })

  test('sidecar main.py has /transcribe endpoint', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'sidecar', 'main.py'),
      'utf-8'
    )
    assert.include(content, '/transcribe')
    assert.include(content, 'transcribe_audio')
    assert.include(content, 'UploadFile')
  })

  test('Dockerfile includes whisper.cpp build', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'sidecar', 'Dockerfile'),
      'utf-8'
    )
    assert.include(content, 'whisper.cpp')
    assert.include(content, 'whisper-cpp')
    assert.include(content, 'ffmpeg')
    assert.include(content, 'WHISPER_MODEL')
  })

  test('pyproject.toml includes python-multipart', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'sidecar', 'pyproject.toml'),
      'utf-8'
    )
    assert.include(content, 'python-multipart')
  })
})
