import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'prompt_templates'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('category', 50).nullable().after('slug')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('category')
    })
  }
}
