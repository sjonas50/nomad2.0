import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type ResourceType = 'zim' | 'pmtiles' | 'osm.pbf' | 'pdf' | 'model' | 'other'
export type ResourceStatus = 'downloading' | 'installed' | 'embedding' | 'ready' | 'failed'

export default class InstalledResource extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare resourceType: ResourceType

  @column()
  declare filePath: string | null

  @column()
  declare fileSize: number

  @column()
  declare status: ResourceStatus

  @column()
  declare ragEnabled: boolean

  @column()
  declare knowledgeSourceId: number | null

  @column()
  declare downloadUrl: string | null

  @column()
  declare errorMessage: string | null

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
}
