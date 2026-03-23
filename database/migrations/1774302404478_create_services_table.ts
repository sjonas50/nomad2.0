import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('name', 100).notNullable().unique()
      table.string('container_name', 255).nullable()
      table.string('image', 255).notNullable()
      table
        .enum('status', ['installed', 'running', 'stopped', 'error', 'not_installed'])
        .notNullable()
        .defaultTo('not_installed')
      table.json('config').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
