import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'mesh_nodes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('node_id', 20).notNullable().unique()
      table.string('long_name', 100).nullable()
      table.string('short_name', 10).nullable()
      table.string('hardware_model', 50).nullable()
      table.float('latitude').nullable()
      table.float('longitude').nullable()
      table.float('altitude').nullable()
      table.float('battery_level').nullable()
      table.float('snr').nullable()
      table.boolean('is_online').notNullable().defaultTo(false)
      table.timestamp('last_heard_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
