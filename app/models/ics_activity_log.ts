import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Incident from '#models/incident'
import User from '#models/user'

export type ActivitySource = 'manual' | 'voice' | 'ai_extracted' | 'mesh'
export type ActivityCategory = 'decision' | 'observation' | 'communication' | 'resource_change'

export default class IcsActivityLog extends BaseModel {
  static table = 'ics_activity_logs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare incidentId: number

  @column()
  declare actorId: number | null

  @column()
  declare activity: string

  @column()
  declare source: ActivitySource

  @column()
  declare category: ActivityCategory

  @column()
  declare correctsId: number | null

  @column.dateTime()
  declare loggedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  // No updatedAt — append-only table

  @belongsTo(() => Incident)
  declare incident: BelongsTo<typeof Incident>

  @belongsTo(() => User, { foreignKey: 'actorId' })
  declare actor: BelongsTo<typeof User>

  @belongsTo(() => IcsActivityLog, { foreignKey: 'correctsId' })
  declare corrects: BelongsTo<typeof IcsActivityLog>
}
