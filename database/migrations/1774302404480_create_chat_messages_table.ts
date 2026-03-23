import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'chat_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('chat_session_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('chat_sessions')
        .onDelete('CASCADE')
      table.enum('role', ['user', 'assistant', 'system']).notNullable()
      table.text('content', 'longtext').notNullable()
      table.text('thinking_content').nullable()
      table.json('sources').nullable()
      table.json('metadata').nullable()

      table.timestamp('created_at').notNullable()

      table.index(['chat_session_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
