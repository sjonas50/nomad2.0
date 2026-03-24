import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class AuditLog extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number | null

  @column()
  declare action: string

  @column()
  declare resourceType: string | null

  @column()
  declare resourceId: string | null

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

  @column()
  declare ipAddress: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
