import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Incident from '#models/incident'

export type PersonnelStatusValue = 'available' | 'deployed' | 'injured' | 'unaccounted'
export type CheckInMethod = 'manual' | 'mesh' | 'voice'

export default class PersonnelStatus extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare incidentId: number

  @column()
  declare status: PersonnelStatusValue

  @column()
  declare locationText: string | null

  @column()
  declare latitude: number | null

  @column()
  declare longitude: number | null

  @column()
  declare assignment: string | null

  @column()
  declare checkedInVia: CheckInMethod

  @column.dateTime()
  declare checkedInAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Incident)
  declare incident: BelongsTo<typeof Incident>
}
