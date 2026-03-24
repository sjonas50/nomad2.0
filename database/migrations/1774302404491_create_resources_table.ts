import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'resources'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('type', 100).notNullable()
      table.string('name', 200).notNullable()
      table.integer('quantity').unsigned().notNullable().defaultTo(1)
      table.decimal('latitude', 10, 7).nullable()
      table.decimal('longitude', 10, 7).nullable()
      table.enum('status', ['available', 'assigned', 'out_of_service']).notNullable().defaultTo('available')
      table.integer('assigned_incident_id').unsigned().nullable().references('id').inTable('incidents').onDelete('SET NULL')
      table.date('expiry_date').nullable()
      table.text('notes').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['status'])
      table.index(['assigned_incident_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
