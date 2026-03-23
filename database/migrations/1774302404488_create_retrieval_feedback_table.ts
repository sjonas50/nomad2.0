import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'retrieval_feedback'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.integer('chat_message_id').unsigned().notNullable().references('id').inTable('chat_messages').onDelete('CASCADE')
      table.enum('rating', ['positive', 'negative']).notNullable()
      table.text('comment').nullable()
      table.json('source_ids').nullable()
      table.timestamp('created_at').notNullable()

      table.unique(['user_id', 'chat_message_id'])
      table.index(['chat_message_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
