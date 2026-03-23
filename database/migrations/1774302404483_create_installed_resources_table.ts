import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'installed_resources'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('name').notNullable()
      table.string('resource_type').notNullable()
      table.string('file_path').nullable()
      table.bigInteger('file_size').notNullable().defaultTo(0)
      table
        .enum('status', ['downloading', 'installed', 'embedding', 'ready', 'failed'])
        .notNullable()
        .defaultTo('downloading')
      table.boolean('rag_enabled').notNullable().defaultTo(false)
      table.integer('knowledge_source_id').unsigned().nullable()
      table.string('download_url').nullable()
      table.string('error_message').nullable()
      table.json('metadata').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()

      table.index(['resource_type'])
      table.index(['status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
