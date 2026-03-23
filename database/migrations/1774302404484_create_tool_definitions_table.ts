import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tool_definitions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name', 100).notNullable().unique()
      table.string('display_name', 200).notNullable()
      table.text('description').notNullable()
      table.string('category', 50).notNullable().defaultTo('general')
      table.json('parameters').notNullable()
      table.string('minimum_role', 20).notNullable().defaultTo('operator')
      table.boolean('requires_confirmation').notNullable().defaultTo(false)
      table.boolean('is_builtin').notNullable().defaultTo(false)
      table.boolean('is_enabled').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
