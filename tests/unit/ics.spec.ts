import { test } from '@japa/runner'
import Incident from '#models/incident'
import EssentialFunction from '#models/essential_function'
import Resource from '#models/resource'
import IcsActivityLog from '#models/ics_activity_log'
import PersonnelStatus from '#models/personnel_status'
import CommunicationTree from '#models/communication_tree'
import type { TreeContact } from '#models/communication_tree'
import ICSService from '#services/ics_service'

// --- Model Tests ---

test.group('Incident Model — Unit Tests', () => {
  test('Incident model defines correct types', ({ assert }) => {
    const incident = new Incident()
    assert.isDefined(incident)
    assert.isUndefined(incident.id)
  })

  test('Incident type values are valid', ({ assert }) => {
    const validTypes = [
      'natural_disaster', 'infrastructure_failure', 'security',
      'medical', 'cyber', 'pandemic', 'other',
    ]
    for (const t of validTypes) {
      const incident = new Incident()
      incident.type = t as any
      assert.equal(incident.type, t)
    }
  })

  test('Incident status values are valid', ({ assert }) => {
    const validStatuses = ['declared', 'active', 'contained', 'closed']
    for (const s of validStatuses) {
      const incident = new Incident()
      incident.status = s as any
      assert.equal(incident.status, s)
    }
  })

  test('isActive returns true for declared and active', ({ assert }) => {
    const incident = new Incident()
    incident.status = 'declared'
    assert.isTrue(incident.isActive)
    incident.status = 'active'
    assert.isTrue(incident.isActive)
    incident.status = 'contained'
    assert.isFalse(incident.isActive)
    incident.status = 'closed'
    assert.isFalse(incident.isActive)
  })
})

test.group('EssentialFunction Model — Unit Tests', () => {
  test('EssentialFunction model instantiates', ({ assert }) => {
    const fn = new EssentialFunction()
    assert.isDefined(fn)
  })

  test('priority accepts valid values', ({ assert }) => {
    const fn = new EssentialFunction()
    fn.priority = 1
    assert.equal(fn.priority, 1)
    fn.priority = 3
    assert.equal(fn.priority, 3)
  })

  test('status values are valid', ({ assert }) => {
    for (const s of ['nominal', 'degraded', 'failed']) {
      const fn = new EssentialFunction()
      fn.status = s as any
      assert.equal(fn.status, s)
    }
  })
})

test.group('Resource Model — Unit Tests', () => {
  test('Resource model instantiates', ({ assert }) => {
    const r = new Resource()
    assert.isDefined(r)
  })

  test('status values are valid', ({ assert }) => {
    for (const s of ['available', 'assigned', 'out_of_service']) {
      const r = new Resource()
      r.status = s as any
      assert.equal(r.status, s)
    }
  })
})

test.group('IcsActivityLog Model — Unit Tests', () => {
  test('IcsActivityLog model has correct table name', ({ assert }) => {
    assert.equal(IcsActivityLog.table, 'ics_activity_logs')
  })

  test('source values are valid', ({ assert }) => {
    for (const s of ['manual', 'voice', 'ai_extracted', 'mesh']) {
      const log = new IcsActivityLog()
      log.source = s as any
      assert.equal(log.source, s)
    }
  })

  test('category values are valid', ({ assert }) => {
    for (const c of ['decision', 'observation', 'communication', 'resource_change']) {
      const log = new IcsActivityLog()
      log.category = c as any
      assert.equal(log.category, c)
    }
  })
})

test.group('PersonnelStatus Model — Unit Tests', () => {
  test('PersonnelStatus model instantiates', ({ assert }) => {
    const ps = new PersonnelStatus()
    assert.isDefined(ps)
  })

  test('status values are valid', ({ assert }) => {
    for (const s of ['available', 'deployed', 'injured', 'unaccounted']) {
      const ps = new PersonnelStatus()
      ps.status = s as any
      assert.equal(ps.status, s)
    }
  })

  test('checkedInVia values are valid', ({ assert }) => {
    for (const v of ['manual', 'mesh', 'voice']) {
      const ps = new PersonnelStatus()
      ps.checkedInVia = v as any
      assert.equal(ps.checkedInVia, v)
    }
  })
})

test.group('CommunicationTree Model — Unit Tests', () => {
  test('CommunicationTree model instantiates', ({ assert }) => {
    const tree = new CommunicationTree()
    assert.isDefined(tree)
  })

  test('type values are valid', ({ assert }) => {
    for (const t of ['pace', 'calldown', 'escalation']) {
      const tree = new CommunicationTree()
      tree.type = t as any
      assert.equal(tree.type, t)
    }
  })

  test('TreeContact interface supports PACE methods', ({ assert }) => {
    const contact: TreeContact = {
      name: 'John Doe',
      role: 'IC',
      methods: [
        { type: 'radio', value: '155.000 MHz', priority: 'primary' },
        { type: 'mesh', value: 'channel-1', priority: 'alternate' },
        { type: 'phone', value: '+1-555-0100', priority: 'contingency' },
        { type: 'satellite', value: 'ISAT-12345', priority: 'emergency' },
      ],
    }
    assert.equal(contact.methods.length, 4)
    assert.equal(contact.methods[0].priority, 'primary')
    assert.equal(contact.methods[3].priority, 'emergency')
  })
})

// --- ICSService Tests ---

test.group('ICSService — Unit Tests', () => {
  test('ICSService instantiates', ({ assert }) => {
    const service = new ICSService()
    assert.isDefined(service)
    assert.isFunction(service.declareIncident)
    assert.isFunction(service.updateStatus)
    assert.isFunction(service.logActivity)
    assert.isFunction(service.checkInPersonnel)
    assert.isFunction(service.getActiveIncident)
    assert.isFunction(service.getIncidentSummary)
    assert.isFunction(service.buildContextBlock)
    assert.isFunction(service.getAARData)
  })
})

// --- ICS Tool Interface Tests ---

test.group('ICS Tools — Unit Tests', () => {
  test('declare_incident tool has correct interface', async ({ assert }) => {
    const tool = (await import('#tools/ics_declare_incident')).default
    assert.equal(tool.name, 'declare_incident')
    assert.equal(tool.category, 'ics')
    assert.equal(tool.minimumRole, 'operator')
    assert.isTrue(tool.requiresConfirmation)
    assert.isFunction(tool.execute)
    assert.isTrue(tool.parameters.some((p) => p.name === 'name' && p.required))
    assert.isTrue(tool.parameters.some((p) => p.name === 'type' && p.required))
  })

  test('log_activity tool has correct interface', async ({ assert }) => {
    const tool = (await import('#tools/ics_log_activity')).default
    assert.equal(tool.name, 'log_activity')
    assert.equal(tool.category, 'ics')
    assert.equal(tool.minimumRole, 'viewer')
    assert.isFalse(tool.requiresConfirmation)
    assert.isTrue(tool.parameters.some((p) => p.name === 'activity' && p.required))
  })

  test('check_in tool has correct interface', async ({ assert }) => {
    const tool = (await import('#tools/ics_check_in')).default
    assert.equal(tool.name, 'check_in')
    assert.equal(tool.category, 'ics')
    assert.equal(tool.minimumRole, 'viewer')
    assert.isTrue(tool.parameters.some((p) => p.name === 'status' && p.required))
  })

  test('resource_status tool has correct interface', async ({ assert }) => {
    const tool = (await import('#tools/ics_resource_status')).default
    assert.equal(tool.name, 'resource_status')
    assert.equal(tool.category, 'ics')
    assert.equal(tool.minimumRole, 'viewer')
  })

  test('generate_aar tool has correct interface', async ({ assert }) => {
    const tool = (await import('#tools/ics_generate_aar')).default
    assert.equal(tool.name, 'generate_aar')
    assert.equal(tool.category, 'ics')
    assert.equal(tool.minimumRole, 'operator')
  })
})

// --- Template Tests ---

test.group('ICS/BCP Templates — Unit Tests', () => {
  test('seeder file exists and exports', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'database', 'seeders', 'ics_templates_seeder.ts'),
      'utf-8'
    )
    assert.include(content, 'ics-211-par')
    assert.include(content, 'ics-213rr-resource-request')
    assert.include(content, 'ics-214-activity-log')
    assert.include(content, 'ics-pace-plan')
    assert.include(content, 'ics-emergency-comms')
    assert.include(content, 'bcp-impact-analysis')
    assert.include(content, 'bcp-recovery-matrix')
    assert.include(content, 'bcp-communication-cascade')
    assert.include(content, 'bcp-it-disaster-recovery')
  })
})

// --- Migration Tests ---

test.group('ICS Migrations — Unit Tests', () => {
  test('all ICS migrations exist', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const migrationsDir = join(import.meta.dirname, '..', '..', 'database', 'migrations')

    const migrations = [
      '1774302404489_create_incidents_table.ts',
      '1774302404490_create_essential_functions_table.ts',
      '1774302404491_create_resources_table.ts',
      '1774302404492_create_ics_activity_logs_table.ts',
      '1774302404493_create_personnel_statuses_table.ts',
      '1774302404494_create_communication_trees_table.ts',
      '1774302404495_add_category_to_prompt_templates_table.ts',
    ]

    for (const m of migrations) {
      await access(join(migrationsDir, m))
      assert.isTrue(true, `Migration ${m} exists`)
    }
  })
})

// --- Orchestrator Integration ---

test.group('AIChatOrchestrator — ICS Integration', () => {
  test('orchestrator registers ICS tools', async ({ assert }) => {
    const { default: AIChatOrchestrator } = await import('#services/ai_chat_orchestrator')
    const orchestrator = new AIChatOrchestrator()
    const registry = orchestrator.getToolRegistry()

    const tools = registry.list('admin')
    const toolNames = tools.map((t: any) => t.name)

    assert.include(toolNames, 'declare_incident')
    assert.include(toolNames, 'log_activity')
    assert.include(toolNames, 'check_in')
    assert.include(toolNames, 'resource_status')
    assert.include(toolNames, 'generate_aar')
  })
})
