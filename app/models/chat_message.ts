import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ChatSession from './chat_session.js'

export type MessageRole = 'user' | 'assistant' | 'system'

export default class ChatMessage extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare chatSessionId: number

  @column()
  declare role: MessageRole

  @column()
  declare content: string

  @column()
  declare thinkingContent: string | null

  @column({
    prepare: (value: unknown[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => {
      if (!value) return null
      if (typeof value === 'object') return value
      if (typeof value === 'string') return JSON.parse(value)
      return null
    },
  })
  declare sources: unknown[] | null

  @column({
    prepare: (value: Record<string, unknown> | null) => (value ? JSON.stringify(value) : null),
    consume: (value: unknown) => {
      if (!value) return null
      if (typeof value === 'object') return value
      if (typeof value === 'string') return JSON.parse(value)
      return null
    },
  })
  declare metadata: Record<string, unknown> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => ChatSession)
  declare chatSession: BelongsTo<typeof ChatSession>
}
