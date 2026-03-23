import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class MeshMessage extends BaseModel {
  static table = 'mesh_messages'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare packetId: string

  @column()
  declare fromNode: string

  @column()
  declare toNode: string | null

  @column()
  declare channel: string

  @column()
  declare portNum: string

  @column()
  declare content: string | null

  @column({
    prepare: (value: Record<string, unknown> | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | null) => (value ? JSON.parse(value) : null),
  })
  declare rawPayload: Record<string, unknown> | null

  @column()
  declare isEmbedded: boolean

  @column.dateTime()
  declare receivedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
