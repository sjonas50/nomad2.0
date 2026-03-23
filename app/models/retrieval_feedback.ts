import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import ChatMessage from '#models/chat_message'

export default class RetrievalFeedback extends BaseModel {
  static table = 'retrieval_feedback'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare chatMessageId: number

  @column()
  declare rating: 'positive' | 'negative'

  @column()
  declare comment: string | null

  @column({
    prepare: (value: string[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | null) => (value ? JSON.parse(value) : null),
  })
  declare sourceIds: string[] | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => ChatMessage)
  declare message: BelongsTo<typeof ChatMessage>
}
