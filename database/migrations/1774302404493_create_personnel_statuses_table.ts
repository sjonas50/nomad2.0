import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'personnel_statuses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.integer('incident_id').unsigned().notNullable().references('id').inTable('incidents').onDelete('CASCADE')
      table.enum('status', ['available', 'deployed', 'injured', 'unaccounted']).notNullable().defaultTo('unaccounted')
      table.string('location_text', 500).nullable()
      table.decimal('latitude', 10, 7).nullable()
      table.decimal('longitude', 10, 7).nullable()
      table.string('assignment', 500).nullable()
      table.enum('checked_in_via', ['manual', 'mesh', 'voice']).notNullable().defaultTo('manual')
      table.timestamp('checked_in_at').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['incident_id', 'status'])
      table.unique(['user_id', 'incident_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
