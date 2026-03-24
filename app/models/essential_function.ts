import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Incident from '#models/incident'

export type FunctionStatus = 'nominal' | 'degraded' | 'failed'

export default class EssentialFunction extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare incidentId: number

  @column()
  declare name: string

  @column()
  declare priority: number

  @column()
  declare status: FunctionStatus

  @column({
    prepare: (value: unknown[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | null) => (value ? JSON.parse(value) : null),
  })
  declare primaryPersonnel: unknown[] | null

  @column({
    prepare: (value: unknown[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | null) => (value ? JSON.parse(value) : null),
  })
  declare alternatePersonnel: unknown[] | null

  @column({
    prepare: (value: unknown[] | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | null) => (value ? JSON.parse(value) : null),
  })
  declare procedures: unknown[] | null

  @column()
  declare recoveryTimeObjective: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Incident)
  declare incident: BelongsTo<typeof Incident>
}
