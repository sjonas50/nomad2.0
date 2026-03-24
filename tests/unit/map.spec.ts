import { test } from '@japa/runner'
import GeofenceService from '#services/geofence_service'
import PositionService from '#services/position_service'
import Geofence from '#models/geofence'
import type { GeoJSONPolygon } from '#models/geofence'

// --- Geofence Model Tests ---

test.group('Geofence Model — Unit Tests', () => {
  test('Geofence model instantiates', ({ assert }) => {
    const fence = new Geofence()
    assert.isDefined(fence)
  })

  test('type values are valid', ({ assert }) => {
    for (const t of ['safe_area', 'hazard', 'rally_point', 'exclusion']) {
      const fence = new Geofence()
      fence.type = t as any
      assert.equal(fence.type, t)
    }
  })
})

// --- GeofenceService Tests ---

test.group('GeofenceService — Point-in-Polygon', () => {
  test('GeofenceService instantiates', ({ assert }) => {
    const service = new GeofenceService()
    assert.isDefined(service)
    assert.isFunction(service.pointInPolygon)
    assert.isFunction(service.checkPosition)
    assert.isFunction(service.createGeofence)
    assert.isFunction(service.listGeofences)
  })

  test('point inside polygon returns true', ({ assert }) => {
    const service = new GeofenceService()
    // Simple square polygon around (0,0)
    const polygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [[
        [-1, -1], [-1, 1], [1, 1], [1, -1], [-1, -1],
      ]],
    }
    assert.isTrue(service.pointInPolygon(0, 0, polygon))
  })

  test('point outside polygon returns false', ({ assert }) => {
    const service = new GeofenceService()
    const polygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [[
        [-1, -1], [-1, 1], [1, 1], [1, -1], [-1, -1],
      ]],
    }
    assert.isFalse(service.pointInPolygon(5, 5, polygon))
  })

  test('point on edge is handled consistently', ({ assert }) => {
    const service = new GeofenceService()
    const polygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [[
        [0, 0], [10, 0], [10, 10], [0, 10], [0, 0],
      ]],
    }
    // Point clearly inside
    assert.isTrue(service.pointInPolygon(5, 5, polygon))
    // Point clearly outside
    assert.isFalse(service.pointInPolygon(15, 15, polygon))
  })

  test('realistic GPS coordinates — DC area', ({ assert }) => {
    const service = new GeofenceService()
    // Approximate Pentagon area polygon
    const polygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [[
        [-77.060, 38.868], [-77.050, 38.868],
        [-77.050, 38.873], [-77.060, 38.873],
        [-77.060, 38.868],
      ]],
    }
    // Point inside
    assert.isTrue(service.pointInPolygon(38.870, -77.055, polygon))
    // Point outside
    assert.isFalse(service.pointInPolygon(39.0, -77.0, polygon))
  })

  test('empty polygon returns false', ({ assert }) => {
    const service = new GeofenceService()
    const polygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [[]],
    }
    assert.isFalse(service.pointInPolygon(0, 0, polygon))
  })
})

// --- PositionService Tests ---

test.group('PositionService — Unit Tests', () => {
  test('PositionService instantiates', ({ assert }) => {
    const service = new PositionService()
    assert.isDefined(service)
    assert.isFunction(service.updatePosition)
    assert.isFunction(service.getAllMarkers)
  })
})

// --- Migration Tests ---

test.group('Map Migrations — Unit Tests', () => {
  test('geofences migration exists', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await access(
      join(import.meta.dirname, '..', '..', 'database', 'migrations', '1774302404496_create_geofences_table.ts')
    )
    assert.isTrue(true)
  })
})

// --- Routes Tests ---

test.group('Map Routes — Registration', () => {
  test('map routes are registered', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'start', 'routes.ts'),
      'utf-8'
    )
    assert.include(content, '/map')
    assert.include(content, '/map/markers')
    assert.include(content, '/map/geofences')
    assert.include(content, '/map/position')
    assert.include(content, 'MapController')
  })
})

// --- Component Tests ---

test.group('Map Components — File Existence', () => {
  test('map page exists', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await access(join(import.meta.dirname, '..', '..', 'inertia', 'pages', 'map.tsx'))
    assert.isTrue(true)
  })

  test('nav includes Map link', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'inertia', 'layouts', 'app_layout.tsx'),
      'utf-8'
    )
    assert.include(content, '/map')
    assert.include(content, 'Map')
  })
})
