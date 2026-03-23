import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import AuditLog from '#models/audit_log'
import logger from '@adonisjs/core/services/logger'

// Routes that should be audited
const AUDITED_PATTERNS: Array<{ pattern: RegExp; action: string; resourceType: string }> = [
  // Auth events
  { pattern: /^POST \/login$/, action: 'auth.login', resourceType: 'user' },
  { pattern: /^POST \/logout$/, action: 'auth.logout', resourceType: 'user' },
  { pattern: /^POST \/setup$/, action: 'auth.setup', resourceType: 'user' },

  // Knowledge management
  { pattern: /^POST \/api\/knowledge\/upload$/, action: 'knowledge.upload', resourceType: 'knowledge_source' },
  { pattern: /^POST \/api\/knowledge\/text$/, action: 'knowledge.upload_text', resourceType: 'knowledge_source' },
  { pattern: /^DELETE \/api\/knowledge\//, action: 'knowledge.delete', resourceType: 'knowledge_source' },
  { pattern: /^POST \/api\/knowledge\/.*\/re-embed$/, action: 'knowledge.re_embed', resourceType: 'knowledge_source' },

  // Library / downloads
  { pattern: /^POST \/api\/library\/download$/, action: 'library.download', resourceType: 'installed_resource' },
  { pattern: /^DELETE \/api\/library\//, action: 'library.delete', resourceType: 'installed_resource' },

  // Docker services
  { pattern: /^POST \/api\/services\/.*\/start$/, action: 'service.start', resourceType: 'container' },
  { pattern: /^POST \/api\/services\/.*\/stop$/, action: 'service.stop', resourceType: 'container' },
  { pattern: /^POST \/api\/services\/.*\/restart$/, action: 'service.restart', resourceType: 'container' },

  // WiFi
  { pattern: /^POST \/api\/wifi\/start$/, action: 'wifi.start', resourceType: 'wifi_ap' },
  { pattern: /^POST \/api\/wifi\/stop$/, action: 'wifi.stop', resourceType: 'wifi_ap' },

  // Mesh
  { pattern: /^POST \/api\/mesh\/embed$/, action: 'mesh.embed', resourceType: 'mesh_message' },

  // Admin
  { pattern: /^POST \/api\/admin\/users/, action: 'admin.user_manage', resourceType: 'user' },
  { pattern: /^DELETE \/api\/admin\/users/, action: 'admin.user_delete', resourceType: 'user' },
  { pattern: /^POST \/api\/admin\/backup/, action: 'admin.backup', resourceType: 'backup' },
  { pattern: /^POST \/api\/admin\/restore/, action: 'admin.restore', resourceType: 'backup' },
]

export default class AuditMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request } = ctx
    const method = request.method()
    const url = request.url()
    const routeKey = `${method} ${url}`

    // Check if this route should be audited
    const match = AUDITED_PATTERNS.find((p) => p.pattern.test(routeKey))

    const output = await next()

    // Log after the response is generated
    if (match) {
      try {
        // Extract resource ID from URL params if present
        const idMatch = url.match(/\/(\d+|[a-f0-9-]+)(?:\/[a-z-]+)?$/)
        const resourceId = idMatch ? idMatch[1] : null

        await AuditLog.create({
          userId: ctx.auth?.user?.id || null,
          action: match.action,
          resourceType: match.resourceType,
          resourceId,
          metadata: {
            method,
            url,
            statusCode: ctx.response.getStatus(),
            userAgent: request.header('user-agent')?.slice(0, 200),
          },
          ipAddress: request.ip(),
        })
      } catch (error) {
        // Audit logging should never break the request
        logger.error({ error, action: match.action }, 'Failed to write audit log')
      }
    }

    return output
  }
}
