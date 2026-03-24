import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export type IncidentType =
  | 'natural_disaster'
  | 'infrastructure_failure'
  | 'security'
  | 'medical'
  | 'cyber'
  | 'pandemic'
  | 'other'

export type IncidentStatus = 'declared' | 'active' | 'contained' | 'closed'

export default class Incident extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare type: IncidentType

  @column()
  declare status: IncidentStatus

  @column()
  declare iapPeriod: number

  @column()
  declare incidentCommanderId: number | null

  @column()
  declare description: string | null

  @column.dateTime()
  declare declaredAt: DateTime

  @column.dateTime()
  declare closedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => User, { foreignKey: 'incidentCommanderId' })
  declare incidentCommander: BelongsTo<typeof User>

  get isActive(): boolean {
    return this.status === 'declared' || this.status === 'active'
  }
}
