import type { UserRole } from '#models/user'
import type { ToolParameter } from '#models/tool_definition'

export interface ToolExecutionContext {
  userId: number
  userRole: UserRole
  confirmed?: boolean
}

export interface ToolResult {
  success: boolean
  message: string
  data?: Record<string, unknown>
  requiresConfirmation?: boolean
  confirmationMessage?: string
}

export interface ToolHandler {
  name: string
  displayName: string
  description: string
  category: string
  parameters: ToolParameter[]
  minimumRole: UserRole
  requiresConfirmation: boolean
  execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult>
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
}

export default class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map()

  register(handler: ToolHandler): void {
    this.tools.set(handler.name, handler)
  }

  get(name: string): ToolHandler | undefined {
    return this.tools.get(name)
  }

  list(userRole?: UserRole): ToolHandler[] {
    const all = Array.from(this.tools.values())
    if (!userRole) return all
    return all.filter((t) => ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[t.minimumRole])
  }

  hasAccess(toolName: string, userRole: UserRole): boolean {
    const tool = this.tools.get(toolName)
    if (!tool) return false
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[tool.minimumRole]
  }

  validateParams(
    toolName: string,
    params: Record<string, unknown>
  ): { valid: boolean; errors: string[] } {
    const tool = this.tools.get(toolName)
    if (!tool) return { valid: false, errors: [`Tool "${toolName}" not found`] }

    const errors: string[] = []
    for (const param of tool.parameters) {
      const value = params[param.name]
      if (param.required && (value === undefined || value === null)) {
        errors.push(`Missing required parameter: ${param.name}`)
        continue
      }
      if (value !== undefined && value !== null) {
        const actualType = typeof value
        if (actualType !== param.type) {
          errors.push(`Parameter "${param.name}" must be ${param.type}, got ${actualType}`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      return { success: false, message: `Tool "${toolName}" not found` }
    }

    // RBAC check
    if (!this.hasAccess(toolName, context.userRole)) {
      return {
        success: false,
        message: `Insufficient permissions. "${tool.displayName}" requires ${tool.minimumRole} role.`,
      }
    }

    // Parameter validation
    const validation = this.validateParams(toolName, params)
    if (!validation.valid) {
      return { success: false, message: validation.errors.join('; ') }
    }

    // Confirmation check for destructive actions
    if (tool.requiresConfirmation && !context.confirmed) {
      return {
        success: false,
        requiresConfirmation: true,
        message: `This action requires confirmation.`,
        confirmationMessage: `Are you sure you want to execute "${tool.displayName}"?`,
      }
    }

    // Apply defaults
    const resolvedParams = { ...params }
    for (const param of tool.parameters) {
      if (resolvedParams[param.name] === undefined && param.default !== undefined) {
        resolvedParams[param.name] = param.default
      }
    }

    return tool.execute(resolvedParams, context)
  }

  /**
   * Returns tool descriptions formatted for inclusion in LLM system prompts.
   */
  describeForLLM(userRole: UserRole): string {
    const available = this.list(userRole)
    if (available.length === 0) return ''

    const lines = ['Available tools (use JSON to invoke):']
    for (const tool of available) {
      const params = tool.parameters
        .map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}`)
        .join(', ')
      lines.push(`- ${tool.name}(${params}): ${tool.description}`)
    }
    return lines.join('\n')
  }
}
