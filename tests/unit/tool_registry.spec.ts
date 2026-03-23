import { test } from '@japa/runner'
import ToolRegistry from '#services/tool_registry'
import type { ToolHandler, ToolExecutionContext, ToolResult } from '#services/tool_registry'
import PromptTemplateService from '#services/prompt_template_service'
import OnboardingService from '#services/onboarding_service'

// Mock tool for testing
const mockTool: ToolHandler = {
  name: 'test_tool',
  displayName: 'Test Tool',
  description: 'A test tool',
  category: 'test',
  parameters: [
    { name: 'input', type: 'string', description: 'Test input', required: true },
    { name: 'count', type: 'number', description: 'Count', required: false, default: 1 },
  ],
  minimumRole: 'operator',
  requiresConfirmation: false,
  async execute(params: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    return { success: true, message: `Executed with input: ${params.input}` }
  },
}

const destructiveTool: ToolHandler = {
  name: 'dangerous_tool',
  displayName: 'Dangerous Tool',
  description: 'A tool requiring confirmation',
  category: 'test',
  parameters: [],
  minimumRole: 'admin',
  requiresConfirmation: true,
  async execute(_params: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    return { success: true, message: 'Executed dangerous action' }
  },
}

test.group('ToolRegistry — Unit Tests', () => {
  test('register and retrieve tools', ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(mockTool)
    assert.isDefined(registry.get('test_tool'))
    assert.isUndefined(registry.get('nonexistent'))
  })

  test('list tools respects RBAC', ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(mockTool)
    registry.register(destructiveTool)

    const viewerTools = registry.list('viewer')
    assert.lengthOf(viewerTools, 0)

    const operatorTools = registry.list('operator')
    assert.lengthOf(operatorTools, 1)
    assert.equal(operatorTools[0].name, 'test_tool')

    const adminTools = registry.list('admin')
    assert.lengthOf(adminTools, 2)
  })

  test('hasAccess checks role hierarchy', ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(mockTool)
    registry.register(destructiveTool)

    assert.isFalse(registry.hasAccess('test_tool', 'viewer'))
    assert.isTrue(registry.hasAccess('test_tool', 'operator'))
    assert.isTrue(registry.hasAccess('test_tool', 'admin'))
    assert.isFalse(registry.hasAccess('dangerous_tool', 'operator'))
    assert.isTrue(registry.hasAccess('dangerous_tool', 'admin'))
    assert.isFalse(registry.hasAccess('nonexistent', 'admin'))
  })

  test('validateParams checks required params', ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(mockTool)

    const valid = registry.validateParams('test_tool', { input: 'hello' })
    assert.isTrue(valid.valid)
    assert.lengthOf(valid.errors, 0)

    const missing = registry.validateParams('test_tool', {})
    assert.isFalse(missing.valid)
    assert.isAbove(missing.errors.length, 0)
  })

  test('validateParams checks types', ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(mockTool)

    const wrongType = registry.validateParams('test_tool', { input: 123 })
    assert.isFalse(wrongType.valid)
    assert.isAbove(wrongType.errors.length, 0)
  })

  test('validateParams returns error for unknown tool', ({ assert }) => {
    const registry = new ToolRegistry()
    const result = registry.validateParams('nonexistent', {})
    assert.isFalse(result.valid)
  })

  test('execute enforces RBAC', async ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(mockTool)

    const result = await registry.execute('test_tool', { input: 'test' }, {
      userId: 1,
      userRole: 'viewer',
    })
    assert.isFalse(result.success)
    assert.include(result.message, 'Insufficient permissions')
  })

  test('execute validates params before running', async ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(mockTool)

    const result = await registry.execute('test_tool', {}, {
      userId: 1,
      userRole: 'operator',
    })
    assert.isFalse(result.success)
    assert.include(result.message, 'Missing required parameter')
  })

  test('execute requires confirmation for destructive tools', async ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(destructiveTool)

    const result = await registry.execute('dangerous_tool', {}, {
      userId: 1,
      userRole: 'admin',
    })
    assert.isFalse(result.success)
    assert.isTrue(result.requiresConfirmation)

    // With confirmation
    const confirmed = await registry.execute('dangerous_tool', {}, {
      userId: 1,
      userRole: 'admin',
      confirmed: true,
    })
    assert.isTrue(confirmed.success)
  })

  test('execute runs tool successfully', async ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(mockTool)

    const result = await registry.execute('test_tool', { input: 'hello' }, {
      userId: 1,
      userRole: 'operator',
    })
    assert.isTrue(result.success)
    assert.include(result.message, 'hello')
  })

  test('execute returns error for unknown tool', async ({ assert }) => {
    const registry = new ToolRegistry()
    const result = await registry.execute('nonexistent', {}, {
      userId: 1,
      userRole: 'admin',
    })
    assert.isFalse(result.success)
    assert.include(result.message, 'not found')
  })

  test('describeForLLM generates tool descriptions', ({ assert }) => {
    const registry = new ToolRegistry()
    registry.register(mockTool)

    const desc = registry.describeForLLM('operator')
    assert.include(desc, 'test_tool')
    assert.include(desc, 'input')

    const viewerDesc = registry.describeForLLM('viewer')
    assert.equal(viewerDesc, '')
  })
})

test.group('Built-in Tools — Unit Tests', () => {
  test('search_knowledge_base tool has correct interface', async ({ assert }) => {
    const { default: tool } = await import('#tools/search_knowledge_base')
    assert.equal(tool.name, 'search_knowledge_base')
    assert.equal(tool.minimumRole, 'viewer')
    assert.isFalse(tool.requiresConfirmation)
    assert.isFunction(tool.execute)
  })

  test('install_service tool has correct interface', async ({ assert }) => {
    const { default: tool } = await import('#tools/install_service')
    assert.equal(tool.name, 'install_service')
    assert.equal(tool.minimumRole, 'operator')
    assert.isTrue(tool.requiresConfirmation)
  })

  test('download_content tool has correct interface', async ({ assert }) => {
    const { default: tool } = await import('#tools/download_content')
    assert.equal(tool.name, 'download_content')
    assert.equal(tool.minimumRole, 'operator')
    assert.isTrue(tool.requiresConfirmation)
  })

  test('system_diagnostics tool has correct interface', async ({ assert }) => {
    const { default: tool } = await import('#tools/system_diagnostics')
    assert.equal(tool.name, 'system_diagnostics')
    assert.equal(tool.minimumRole, 'viewer')
    assert.isFalse(tool.requiresConfirmation)
  })

  test('manage_model tool has correct interface', async ({ assert }) => {
    const { default: tool } = await import('#tools/manage_model')
    assert.equal(tool.name, 'manage_model')
    assert.equal(tool.minimumRole, 'operator')
    assert.isFalse(tool.requiresConfirmation)
  })
})

test.group('Models — Unit Tests', () => {
  test('ToolDefinition model exists', async ({ assert }) => {
    const { default: ToolDefinition } = await import('#models/tool_definition')
    assert.isDefined(ToolDefinition)
    assert.equal(ToolDefinition.table, 'tool_definitions')
  })

  test('PromptTemplate model exists', async ({ assert }) => {
    const { default: PromptTemplate } = await import('#models/prompt_template')
    assert.isDefined(PromptTemplate)
    assert.equal(PromptTemplate.table, 'prompt_templates')
  })
})

test.group('PromptTemplateService — Unit Tests', () => {
  test('PromptTemplateService instantiates correctly', ({ assert }) => {
    const service = new PromptTemplateService()
    assert.isDefined(service)
    assert.isFunction(service.render)
    assert.isFunction(service.get)
    assert.isFunction(service.upsert)
    assert.isFunction(service.listActive)
  })
})

test.group('OnboardingService — Unit Tests', () => {
  test('OnboardingService instantiates correctly', ({ assert }) => {
    const service = new OnboardingService()
    assert.isDefined(service)
    assert.isFunction(service.getOnboardingStatus)
    assert.isFunction(service.getOnboardingMessage)
    assert.isFunction(service.getOnboardingPrompt)
  })
})
