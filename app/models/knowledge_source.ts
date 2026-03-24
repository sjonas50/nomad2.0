import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type IngestionStatus =
  | 'pending'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'entity_extracting'
  | 'completed'
  | 'failed'

export default class KnowledgeSource extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare filePath: string | null

  @column()
  declare sourceType: string

  @column()
  declare mimeType: string | null

  @column()
  declare status: IngestionStatus

  @column()
  declare errorMessage: string | null

  @column()
  declare chunkCount: number

  @column()
  declare fileSize: number

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

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime()
  declare completedAt: DateTime | null
}
