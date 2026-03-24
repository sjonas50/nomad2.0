import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'geofences'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('incident_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('incidents')
        .onDelete('SET NULL')
      table.string('name', 100).notNullable()
      table
        .enum('type', ['safe_area', 'hazard', 'rally_point', 'exclusion'])
        .notNullable()
        .defaultTo('safe_area')
      table.json('geometry').notNullable() // GeoJSON Polygon
      table.string('description', 500).nullable()
      table.string('color', 7).nullable() // Hex color for map display
      table.boolean('active').notNullable().defaultTo(true)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
