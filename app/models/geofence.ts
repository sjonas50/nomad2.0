import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Incident from '#models/incident'

export type GeofenceType = 'safe_area' | 'hazard' | 'rally_point' | 'exclusion'

export interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export default class Geofence extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare incidentId: number | null

  @column()
  declare name: string

  @column()
  declare type: GeofenceType

  @column({
    prepare: (value: GeoJSONPolygon) => JSON.stringify(value),
    consume: (value: string | GeoJSONPolygon) =>
      typeof value === 'string' ? JSON.parse(value) : value,
  })
  declare geometry: GeoJSONPolygon

  @column()
  declare description: string | null

  @column()
  declare color: string | null

  @column()
  declare active: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Incident)
  declare incident: BelongsTo<typeof Incident>
}
