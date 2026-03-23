import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'knowledge_sources'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('name').notNullable()
      table.string('file_path').nullable()
      table.string('source_type').notNullable()
      table.string('mime_type').nullable()
      table
        .enum('status', [
          'pending',
          'extracting',
          'chunking',
          'embedding',
          'entity_extracting',
          'completed',
          'failed',
        ])
        .notNullable()
        .defaultTo('pending')
      table.string('error_message').nullable()
      table.integer('chunk_count').notNullable().defaultTo(0)
      table.bigInteger('file_size').notNullable().defaultTo(0)
      table.json('metadata').nullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
      table.timestamp('completed_at').nullable()

      table.index(['status'])
      table.index(['source_type'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
