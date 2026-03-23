import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { UserRole } from '#models/user'

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required: boolean
  default?: unknown
}

export default class ToolDefinition extends BaseModel {
  static table = 'tool_definitions'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare displayName: string

  @column()
  declare description: string

  @column()
  declare category: string

  @column({
    prepare: (value: ToolParameter[]) => JSON.stringify(value),
    consume: (value: string) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare parameters: ToolParameter[]

  @column()
  declare minimumRole: UserRole

  @column()
  declare requiresConfirmation: boolean

  @column()
  declare isBuiltin: boolean

  @column()
  declare isEnabled: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null
}
