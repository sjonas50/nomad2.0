import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'communication_trees'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('incident_id').unsigned().nullable().references('id').inTable('incidents').onDelete('CASCADE')
      table.string('name', 200).notNullable()
      table.enum('type', ['pace', 'calldown', 'escalation']).notNullable().defaultTo('pace')
      table.json('tree_data').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['incident_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
