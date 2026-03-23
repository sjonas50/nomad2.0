import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class KvStore extends BaseModel {
  static table = 'kv_store'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare key: string

  @column()
  declare value: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  static async get(key: string): Promise<string | null> {
    const row = await this.findBy('key', key)
    return row?.value ?? null
  }

  static async set(key: string, value: string): Promise<void> {
    const row = await this.findBy('key', key)
    if (row) {
      row.value = value
      await row.save()
    } else {
      await this.create({ key, value })
    }
  }
}
