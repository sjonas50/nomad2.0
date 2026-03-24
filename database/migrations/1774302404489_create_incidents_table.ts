import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'incidents'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name', 200).notNullable()
      table
        .enum('type', [
          'natural_disaster',
          'infrastructure_failure',
          'security',
          'medical',
          'cyber',
          'pandemic',
          'other',
        ])
        .notNullable()
        .defaultTo('other')
      table.enum('status', ['declared', 'active', 'contained', 'closed']).notNullable().defaultTo('declared')
      table.integer('iap_period').notNullable().defaultTo(1)
      table.integer('incident_commander_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL')
      table.text('description').nullable()
      table.timestamp('declared_at').notNullable()
      table.timestamp('closed_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
