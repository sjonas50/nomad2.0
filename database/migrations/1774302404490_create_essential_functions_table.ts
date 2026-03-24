import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'essential_functions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('incident_id').unsigned().notNullable().references('id').inTable('incidents').onDelete('CASCADE')
      table.string('name', 200).notNullable()
      table.integer('priority').unsigned().notNullable().defaultTo(2)
      table.enum('status', ['nominal', 'degraded', 'failed']).notNullable().defaultTo('nominal')
      table.json('primary_personnel').nullable()
      table.json('alternate_personnel').nullable()
      table.json('procedures').nullable()
      table.integer('recovery_time_objective').unsigned().nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['incident_id', 'priority'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
