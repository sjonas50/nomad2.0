import env from '#start/env'
import OllamaService from '#services/ollama_service'
import ICSService from '#services/ics_service'
import type { ActivityCategory } from '#models/ics_activity_log'
import logger from '@adonisjs/core/services/logger'

const DEFAULT_MODEL = 'qwen2.5:1.5b'

export interface TranscriptionResult {
  text: string
  segments: Array<{ start: number; end: number; text: string }>
  language: string
}

export interface ExtractedActivity {
  activity: string
  actor: string | null
  category: ActivityCategory
  resourcesMentioned: string[]
  incidentRef: string | null
  confidence: number
}

export interface VoiceCaptureResult {
  transcription: TranscriptionResult
  extracted: ExtractedActivity
  logId: number | null
  incidentId: number | null
}

const EXTRACTION_PROMPT = `You are an ICS (Incident Command System) activity log extractor. Given a voice transcription from field operations, extract structured data.

Respond with ONLY valid JSON matching this schema:
{
  "activity": "concise description of what happened or was observed",
  "actor": "person name mentioned or null",
  "category": "decision|observation|communication|resource_change",
  "resources_mentioned": ["list of resources, equipment, or supplies mentioned"],
  "incident_ref": "incident name if mentioned or null",
  "confidence": 0.0 to 1.0
}

Rules:
- "activity" should be a clear, concise log entry suitable for ICS-214
- "category" must be exactly one of: decision, observation, communication, resource_change
- Default to "observation" if unclear
- Extract resource names (generators, vehicles, medical supplies, etc.)
- Keep it factual — do not embellish or interpret beyond what was said`

export default class VoiceCaptureService {
  private ollama: OllamaService
  private ics: ICSService

  constructor(ollama?: OllamaService) {
    this.ollama = ollama ?? new OllamaService()
    this.ics = new ICSService()
  }

  /**
   * Send audio to the Python sidecar for whisper.cpp transcription.
   */
  async transcribe(audioBuffer: Buffer, filename: string): Promise<TranscriptionResult> {
    const sidecarUrl = env.get('SIDECAR_URL', 'http://localhost:8100')

    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer]), filename)

    const response = await fetch(`${sidecarUrl}/transcribe`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Transcription failed: ${error}`)
    }

    return (await response.json()) as TranscriptionResult
  }

  /**
   * Use Ollama to extract structured ICS activity data from transcript text.
   */
  async extractActivity(transcript: string): Promise<ExtractedActivity> {
    try {
      const response = await this.ollama.chat(DEFAULT_MODEL, [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: transcript },
      ])

      const parsed = JSON.parse(response.trim())
      return {
        activity: parsed.activity || transcript,
        actor: parsed.actor || null,
        category: this.validateCategory(parsed.category),
        resourcesMentioned: Array.isArray(parsed.resources_mentioned)
          ? parsed.resources_mentioned
          : [],
        incidentRef: parsed.incident_ref || null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      }
    } catch (error) {
      logger.warn({ error }, 'LLM extraction failed, using raw transcript')
      return {
        activity: transcript,
        actor: null,
        category: 'observation',
        resourcesMentioned: [],
        incidentRef: null,
        confidence: 0.0,
      }
    }
  }

  /**
   * Full pipeline: transcribe audio → extract structured data → log to active incident.
   */
  async captureAndLog(
    audioBuffer: Buffer,
    filename: string,
    userId: number
  ): Promise<VoiceCaptureResult> {
    const transcription = await this.transcribe(audioBuffer, filename)
    const extracted = await this.extractActivity(transcription.text)

    let logId: number | null = null
    let incidentId: number | null = null

    const incident = await this.ics.getActiveIncident()
    if (incident) {
      incidentId = incident.id
      const log = await this.ics.logActivity({
        incidentId: incident.id,
        actorId: userId,
        activity: extracted.activity,
        source: 'voice',
        category: extracted.category,
      })
      logId = log.id
      logger.info(
        { logId, incidentId, confidence: extracted.confidence },
        'Voice capture logged to incident'
      )
    }

    return { transcription, extracted, logId, incidentId }
  }

  private validateCategory(category: string): ActivityCategory {
    const valid: ActivityCategory[] = [
      'decision',
      'observation',
      'communication',
      'resource_change',
    ]
    if (valid.includes(category as ActivityCategory)) {
      return category as ActivityCategory
    }
    return 'observation'
  }
}
