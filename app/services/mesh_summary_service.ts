import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import OllamaService from '#services/ollama_service'
import MeshService from '#services/mesh_service'

const SUMMARY_MODEL = 'qwen2.5:1.5b'

export default class MeshSummaryService {
  private ollama: OllamaService
  private meshService: MeshService

  constructor(ollama?: OllamaService, meshService?: MeshService) {
    this.ollama = ollama ?? new OllamaService()
    this.meshService = meshService ?? new MeshService()
  }

  /**
   * Generate a summary of recent mesh traffic for a given time window.
   */
  async summarizeRecent(hours: number = 1): Promise<string | null> {
    const messages = await this.meshService.getMessages({ limit: 100 })
    const cutoff = DateTime.now().minus({ hours })

    const recent = messages.filter(
      (m) => m.receivedAt && m.receivedAt >= cutoff && m.content
    )

    if (recent.length === 0) {
      return null
    }

    const messageTexts = recent.map((m) => {
      const from = m.fromNode
      const time = m.receivedAt?.toFormat('HH:mm') || '??:??'
      const channel = m.channel !== 'default' ? ` [${m.channel}]` : ''
      return `${time}${channel} ${from}: ${m.content}`
    })

    const prompt = [
      `Summarize the following ${recent.length} mesh radio messages from the last ${hours} hour(s).`,
      'Focus on: key topics discussed, any requests or emergencies, node activity patterns.',
      'Keep the summary concise (3-5 sentences).',
      '',
      '--- Messages ---',
      ...messageTexts,
      '--- End ---',
    ].join('\n')

    try {
      const summary = await this.ollama.chat(SUMMARY_MODEL, [
        {
          role: 'system',
          content: 'You summarize mesh radio communications concisely. Focus on actionable information.',
        },
        { role: 'user', content: prompt },
      ])
      return summary.trim()
    } catch (error) {
      logger.error({ error }, 'Failed to generate mesh summary')
      return null
    }
  }

  /**
   * Generate a summary for a specific channel.
   */
  async summarizeChannel(channel: string, hours: number = 1): Promise<string | null> {
    const messages = await this.meshService.getMessages({ channel, limit: 100 })
    const cutoff = DateTime.now().minus({ hours })

    const recent = messages.filter(
      (m) => m.receivedAt && m.receivedAt >= cutoff && m.content
    )

    if (recent.length === 0) return null

    const messageTexts = recent.map((m) => {
      const time = m.receivedAt?.toFormat('HH:mm') || '??:??'
      return `${time} ${m.fromNode}: ${m.content}`
    })

    try {
      const summary = await this.ollama.chat(SUMMARY_MODEL, [
        {
          role: 'system',
          content: `You summarize mesh radio communications for channel "${channel}". Be concise.`,
        },
        {
          role: 'user',
          content: `Summarize these ${recent.length} messages from the last ${hours}h:\n\n${messageTexts.join('\n')}`,
        },
      ])
      return summary.trim()
    } catch (error) {
      logger.error({ error, channel }, 'Failed to generate channel summary')
      return null
    }
  }
}
