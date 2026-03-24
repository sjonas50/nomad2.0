import type { HttpContext } from '@adonisjs/core/http'
import VoiceCaptureService from '#services/voice_capture_service'

export default class VoiceController {
  /**
   * POST /api/voice/capture — Upload audio, transcribe, extract, and log.
   */
  async capture(ctx: HttpContext) {
    const user = ctx.auth.getUserOrFail()
    const file = ctx.request.file('audio', {
      size: '25mb',
      extnames: ['wav', 'webm', 'ogg', 'mp3', 'm4a', 'flac'],
    })

    if (!file) {
      return ctx.response.badRequest({ error: 'No audio file uploaded' })
    }

    if (!file.isValid) {
      return ctx.response.badRequest({ error: file.errors })
    }

    const buffer = await this.readUploadedFile(file)
    const service = new VoiceCaptureService()
    const result = await service.captureAndLog(buffer, file.clientName, user.id)

    return ctx.response.ok({
      transcription: result.transcription,
      extracted: result.extracted,
      logId: result.logId,
      incidentId: result.incidentId,
    })
  }

  /**
   * POST /api/voice/transcribe — Transcribe only (no extraction or logging).
   */
  async transcribe(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const file = ctx.request.file('audio', {
      size: '25mb',
      extnames: ['wav', 'webm', 'ogg', 'mp3', 'm4a', 'flac'],
    })

    if (!file) {
      return ctx.response.badRequest({ error: 'No audio file uploaded' })
    }

    if (!file.isValid) {
      return ctx.response.badRequest({ error: file.errors })
    }

    const buffer = await this.readUploadedFile(file)
    const service = new VoiceCaptureService()
    const transcription = await service.transcribe(buffer, file.clientName)

    return ctx.response.ok({ transcription })
  }

  /**
   * POST /api/voice/extract — Extract structured data from text (no audio).
   */
  async extract(ctx: HttpContext) {
    ctx.auth.getUserOrFail()
    const { text } = ctx.request.only(['text'])

    if (!text || typeof text !== 'string') {
      return ctx.response.badRequest({ error: 'text field is required' })
    }

    const service = new VoiceCaptureService()
    const extracted = await service.extractActivity(text)

    return ctx.response.ok({ extracted })
  }

  private async readUploadedFile(file: any): Promise<Buffer> {
    const { readFile } = await import('node:fs/promises')
    return readFile(file.tmpPath!)
  }
}
