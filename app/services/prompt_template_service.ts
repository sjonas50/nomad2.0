import PromptTemplate from '#models/prompt_template'

export default class PromptTemplateService {
  /**
   * Render a template by slug, substituting {{variable}} placeholders.
   */
  async render(slug: string, vars: Record<string, string> = {}): Promise<string> {
    const template = await PromptTemplate.query()
      .where('slug', slug)
      .where('isActive', true)
      .orderBy('version', 'desc')
      .first()

    if (!template) {
      throw new Error(`Prompt template "${slug}" not found`)
    }

    return this.interpolate(template.template, vars)
  }

  /**
   * Get a template by slug without rendering.
   */
  async get(slug: string): Promise<PromptTemplate | null> {
    return PromptTemplate.query()
      .where('slug', slug)
      .where('isActive', true)
      .orderBy('version', 'desc')
      .first()
  }

  /**
   * Create or update a template (creates new version).
   */
  async upsert(
    slug: string,
    data: { name: string; template: string; variables?: string[] }
  ): Promise<PromptTemplate> {
    const existing = await PromptTemplate.query()
      .where('slug', slug)
      .orderBy('version', 'desc')
      .first()

    if (existing) {
      // Deactivate old version
      existing.isActive = false
      await existing.save()
    }

    return PromptTemplate.create({
      slug,
      name: data.name,
      template: data.template,
      variables: data.variables || null,
      version: existing ? existing.version + 1 : 1,
      isActive: true,
    })
  }

  /**
   * List all active templates.
   */
  async listActive(): Promise<PromptTemplate[]> {
    return PromptTemplate.query().where('isActive', true).orderBy('slug', 'asc')
  }

  private interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return vars[key] !== undefined ? vars[key] : `{{${key}}}`
    })
  }
}
