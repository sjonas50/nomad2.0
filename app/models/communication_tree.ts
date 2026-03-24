import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Incident from '#models/incident'

export type TreeType = 'pace' | 'calldown' | 'escalation'

export interface TreeContact {
  name: string
  role?: string
  methods: {
    type: 'radio' | 'mesh' | 'phone' | 'email' | 'satellite'
    value: string
    priority: 'primary' | 'alternate' | 'contingency' | 'emergency'
  }[]
}

export default class CommunicationTree extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare incidentId: number | null

  @column()
  declare name: string

  @column()
  declare type: TreeType

  @column({
    prepare: (value: TreeContact[]) => JSON.stringify(value),
    consume: (value: string | null) => (value ? JSON.parse(value) : []),
  })
  declare treeData: TreeContact[]

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Incident)
  declare incident: BelongsTo<typeof Incident>
}
