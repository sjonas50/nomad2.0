import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Incident from '#models/incident'

export type ResourceStatus = 'available' | 'assigned' | 'out_of_service'

export default class Resource extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare type: string

  @column()
  declare name: string

  @column()
  declare quantity: number

  @column()
  declare latitude: number | null

  @column()
  declare longitude: number | null

  @column()
  declare status: ResourceStatus

  @column()
  declare assignedIncidentId: number | null

  @column()
  declare expiryDate: string | null

  @column()
  declare notes: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Incident, { foreignKey: 'assignedIncidentId' })
  declare assignedIncident: BelongsTo<typeof Incident>
}
