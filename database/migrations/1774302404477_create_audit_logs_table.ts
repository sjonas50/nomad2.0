import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'audit_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').notNullable()
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('action', 100).notNullable()
      table.string('resource_type', 100).nullable()
      table.string('resource_id', 100).nullable()
      table.json('metadata').nullable()
      table.string('ip_address', 45).nullable()
      table.timestamp('created_at').notNullable()

      table.index(['action'])
      table.index(['user_id'])
      table.index(['created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
