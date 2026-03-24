import { test } from '@japa/runner'
import BundleService from '#services/bundle_service'
import SyncService from '#services/sync_service'
import PeerDiscoveryService from '#services/peer_discovery_service'

// --- BundleService Tests ---

test.group('BundleService — Unit Tests', () => {
  test('BundleService instantiates', ({ assert }) => {
    const service = new BundleService()
    assert.isDefined(service)
    assert.isFunction(service.exportBundle)
    assert.isFunction(service.importBundle)
    assert.isFunction(service.listBundles)
    assert.isFunction(service.deleteBundle)
  })

  test('listBundles returns array', async ({ assert }) => {
    const service = new BundleService()
    const bundles = await service.listBundles()
    assert.isArray(bundles)
  })
})

// --- SyncService Tests ---

test.group('SyncService — Unit Tests', () => {
  test('SyncService instantiates', ({ assert }) => {
    const service = new SyncService()
    assert.isDefined(service)
    assert.isFunction(service.getStatus)
    assert.isFunction(service.getKnownPeers)
    assert.isFunction(service.registerPeer)
    assert.isFunction(service.getStateHash)
    assert.isFunction(service.needsSync)
  })

  test('SyncService has getStateHash method', ({ assert }) => {
    const service = new SyncService()
    assert.isFunction(service.getStateHash)
  })

  test('SyncService has needsSync method', ({ assert }) => {
    const service = new SyncService()
    assert.isFunction(service.needsSync)
  })

  test('SyncService has recordSync method', ({ assert }) => {
    const service = new SyncService()
    assert.isFunction(service.recordSync)
  })
})

// --- PeerDiscoveryService Tests ---

test.group('PeerDiscoveryService — Unit Tests', () => {
  test('PeerDiscoveryService instantiates', ({ assert }) => {
    const service = new PeerDiscoveryService()
    assert.isDefined(service)
    assert.isFunction(service.scanOnce)
    assert.isFunction(service.advertise)
  })
})

// --- Ace Commands Tests ---

test.group('Sync Commands — File Existence', () => {
  test('sync:export command exists', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await access(join(import.meta.dirname, '..', '..', 'commands', 'sync_export.ts'))
    assert.isTrue(true)
  })

  test('sync:import command exists', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await access(join(import.meta.dirname, '..', '..', 'commands', 'sync_import.ts'))
    assert.isTrue(true)
  })

  test('sync_export command has correct metadata', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'commands', 'sync_export.ts'),
      'utf-8'
    )
    assert.include(content, 'sync:export')
    assert.include(content, 'BundleService')
    assert.include(content, 'exportBundle')
  })

  test('sync_import command has correct metadata', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'commands', 'sync_import.ts'),
      'utf-8'
    )
    assert.include(content, 'sync:import')
    assert.include(content, 'BundleService')
    assert.include(content, 'importBundle')
    assert.include(content, '.attic')
  })
})

// --- Routes Tests ---

test.group('Sync Routes — Registration', () => {
  test('sync routes are registered', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'start', 'routes.ts'),
      'utf-8'
    )
    assert.include(content, '/sync/status')
    assert.include(content, '/sync/peers')
    assert.include(content, '/sync/export')
    assert.include(content, '/sync/import')
    assert.include(content, '/sync/bundles')
    assert.include(content, '/sync/download')
    assert.include(content, 'SyncController')
  })
})

// --- Component Tests ---

test.group('Sync Components — File Existence', () => {
  test('sync_status component exists', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await access(join(import.meta.dirname, '..', '..', 'inertia', 'components', 'sync_status.tsx'))
    assert.isTrue(true)
  })
})
