import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'ics_activity_logs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('incident_id').unsigned().notNullable().references('id').inTable('incidents').onDelete('CASCADE')
      table.integer('actor_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL')
      table.text('activity').notNullable()
      table.enum('source', ['manual', 'voice', 'ai_extracted', 'mesh']).notNullable().defaultTo('manual')
      table.enum('category', ['decision', 'observation', 'communication', 'resource_change']).notNullable().defaultTo('observation')
      table.integer('corrects_id').unsigned().nullable().references('id').inTable('ics_activity_logs').onDelete('SET NULL')
      table.timestamp('logged_at').notNullable()
      table.timestamp('created_at').notNullable()

      // Append-only: no updated_at column

      table.index(['incident_id', 'logged_at'])
      table.index(['actor_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
