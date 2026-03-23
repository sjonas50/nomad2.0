import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class MeshNode extends BaseModel {
  static table = 'mesh_nodes'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare nodeId: string

  @column()
  declare longName: string | null

  @column()
  declare shortName: string | null

  @column()
  declare hardwareModel: string | null

  @column()
  declare latitude: number | null

  @column()
  declare longitude: number | null

  @column()
  declare altitude: number | null

  @column()
  declare batteryLevel: number | null

  @column()
  declare snr: number | null

  @column()
  declare isOnline: boolean

  @column.dateTime()
  declare lastHeardAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
