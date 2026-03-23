import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'mesh_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('packet_id', 20).notNullable().unique()
      table.string('from_node', 20).notNullable()
      table.string('to_node', 20).nullable()
      table.string('channel', 50).notNullable().defaultTo('default')
      table.string('port_num', 50).notNullable()
      table.text('content').nullable()
      table.json('raw_payload').nullable()
      table.boolean('is_embedded').notNullable().defaultTo(false)
      table.timestamp('received_at').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['channel', 'received_at'])
      table.index(['from_node'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
