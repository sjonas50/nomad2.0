import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import AuditLog from '#models/audit_log'
import PromptTemplate from '#models/prompt_template'
import ModelRole from '#models/model_role'
import BackupService from '#services/backup_service'
import HealthService from '#services/health_service'
import OllamaService from '#services/ollama_service'

export default class AdminController {
  /**
   * Guard that ensures the current user has the admin role.
   */
  private assertAdmin(ctx: HttpContext): void {
    const user = ctx.auth.getUserOrFail()
    if (!user.isAdmin) {
      ctx.response.forbidden({ error: 'Admin access required' })
      throw new Error('Forbidden')
    }
  }

  /**
   * Admin dashboard page.
   * GET /admin
   */
  async index(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const { inertia } = ctx
    const healthService = new HealthService()
    const ollama = new OllamaService()
    const health = await healthService.check()
    const users = await User.query().orderBy('createdAt', 'desc')
    const recentLogs = await AuditLog.query().orderBy('createdAt', 'desc').limit(20)

    let installedModels: string[] = []
    let ollamaAvailable = false
    let modelRoles: { roleName: string; modelName: string }[] = []

    try {
      ollamaAvailable = await ollama.isAvailable()
      if (ollamaAvailable) {
        const models = await ollama.listModels()
        installedModels = models.map((m: { name: string }) => m.name)
      }
    } catch { /* Ollama not available */ }

    try {
      const roles = await ModelRole.all()
      modelRoles = roles.map((r) => ({ roleName: r.roleName, modelName: r.modelName }))
    } catch { /* DB might not be ready */ }

    const { MODEL_CATALOG } = await import('#config/models')

    return inertia.render('admin/dashboard' as any, {
      health,
      users: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt?.toISO(),
      })),
      recentLogs: recentLogs.map((l) => ({
        id: l.id,
        userId: l.userId,
        action: l.action,
        resourceType: l.resourceType,
        resourceId: l.resourceId,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt?.toISO(),
      })),
      ollamaAvailable,
      installedModels,
      modelCatalog: MODEL_CATALOG,
      modelRoles,
    })
  }

  // --- User Management ---

  /**
   * Create a new user.
   * POST /api/admin/users
   */
  async createUser(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const { request, response } = ctx
    const { fullName, email, password, role } = request.only(['fullName', 'email', 'password', 'role'])

    if (!fullName?.trim() || !email?.trim() || !password || password.length < 8) {
      return response.badRequest({ error: 'Full name, email, and password (min 8 chars) are required' })
    }
    if (!['viewer', 'operator', 'admin'].includes(role)) {
      return response.badRequest({ error: 'Invalid role' })
    }

    const existing = await User.findBy('email', email.trim())
    if (existing) {
      return response.conflict({ error: 'A user with that email already exists' })
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      role,
    })

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt?.toISO(),
    }
  }

  /**
   * List users.
   * GET /api/admin/users
   */
  async listUsers(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const users = await User.query().orderBy('createdAt', 'desc')
    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt?.toISO(),
    }))
  }

  /**
   * Update a user's role.
   * PATCH /api/admin/users/:id
   */
  async updateUser(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const { params, request, response } = ctx
    const user = await User.findOrFail(params.id)
    const { role } = request.only(['role'])

    if (!['viewer', 'operator', 'admin'].includes(role)) {
      return response.badRequest({ error: 'Invalid role' })
    }

    user.role = role
    await user.save()
    return { id: user.id, role: user.role }
  }

  /**
   * Delete a user.
   * DELETE /api/admin/users/:id
   */
  async deleteUser(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const { params, auth, response } = ctx
    const currentUser = auth.getUserOrFail()
    if (currentUser.id === Number(params.id)) {
      return response.badRequest({ error: 'Cannot delete your own account' })
    }

    const user = await User.findOrFail(params.id)
    await user.delete()
    return response.noContent()
  }

  // --- Audit Logs ---

  /**
   * List audit logs with pagination.
   * GET /api/admin/audit-logs
   */
  async auditLogs(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const { request } = ctx
    const page = Number(request.qs().page) || 1
    const limit = Math.min(Number(request.qs().limit) || 50, 100)
    const action = request.qs().action as string | undefined

    const query = AuditLog.query().orderBy('createdAt', 'desc')
    if (action) query.where('action', 'like', `${action}%`)

    const logs = await query.paginate(page, limit)
    return logs.toJSON()
  }

  // --- Prompt Templates ---

  /**
   * List prompt templates.
   * GET /api/admin/templates
   */
  async listTemplates(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const templates = await PromptTemplate.query()
      .where('isActive', true)
      .orderBy('slug', 'asc')
    return templates.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      template: t.template,
      variables: t.variables,
      version: t.version,
    }))
  }

  /**
   * Update a prompt template.
   * PUT /api/admin/templates/:slug
   */
  async updateTemplate(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const { params, request } = ctx
    const { name, template, variables } = request.only(['name', 'template', 'variables'])
    const slug = params.slug as string

    // Deactivate old version
    const existing = await PromptTemplate.query()
      .where('slug', slug)
      .where('isActive', true)
      .first()

    if (existing) {
      existing.isActive = false
      await existing.save()
    }

    const newTemplate = await PromptTemplate.create({
      slug,
      name: name || existing?.name || slug,
      template,
      variables: variables || null,
      version: existing ? existing.version + 1 : 1,
      isActive: true,
    })

    return {
      id: newTemplate.id,
      slug: newTemplate.slug,
      version: newTemplate.version,
    }
  }

  // --- Backup/Restore ---

  /**
   * List backups.
   * GET /api/admin/backups
   */
  async listBackups(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const backupService = new BackupService()
    return backupService.listBackups()
  }

  /**
   * Create a backup.
   * POST /api/admin/backup
   */
  async createBackup(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const { request, response } = ctx
    const type = (request.input('type') as string) || 'mysql'
    const backupService = new BackupService()

    try {
      let backup
      if (type === 'qdrant') {
        backup = await backupService.backupQdrant()
      } else {
        backup = await backupService.backupMysql()
      }
      return backup
    } catch (error) {
      return response.internalServerError({
        error: error instanceof Error ? error.message : 'Backup failed',
      })
    }
  }

  /**
   * Restore a backup.
   * POST /api/admin/restore
   */
  async restoreBackup(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const { request, response } = ctx
    const filename = request.input('filename') as string
    if (!filename) {
      return response.badRequest({ error: 'Filename is required' })
    }

    const backupService = new BackupService()
    try {
      await backupService.restoreMysql(filename)
      return { status: 'restored', filename }
    } catch (error) {
      return response.internalServerError({
        error: error instanceof Error ? error.message : 'Restore failed',
      })
    }
  }

  /**
   * Delete a backup.
   * DELETE /api/admin/backups/:filename
   */
  async deleteBackup(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const { params, response } = ctx
    const backupService = new BackupService()
    try {
      await backupService.deleteBackup(params.filename)
      return response.noContent()
    } catch (error) {
      return response.badRequest({
        error: error instanceof Error ? error.message : 'Delete failed',
      })
    }
  }

  // --- Health ---

  /**
   * System health check.
   * GET /api/admin/health
   */
  async health(ctx: HttpContext) {
    this.assertAdmin(ctx)
    const healthService = new HealthService()
    return healthService.check()
  }
}
