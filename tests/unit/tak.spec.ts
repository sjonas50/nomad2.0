import { test } from '@japa/runner'
import CoTService from '#services/cot_service'
import CoTListener from '#services/cot_listener'
import CoTPublisher from '#services/cot_publisher'

// --- CoT XML Parsing Tests ---

test.group('CoTService — XML Parsing', () => {
  test('CoTService instantiates', ({ assert }) => {
    const service = new CoTService()
    assert.isDefined(service)
    assert.isFunction(service.parseEvent)
    assert.isFunction(service.isPLI)
    assert.isFunction(service.isGeoChat)
    assert.isFunction(service.extractPLI)
    assert.isFunction(service.extractGeoChat)
    assert.isFunction(service.generatePLI)
    assert.isFunction(service.generateAlert)
  })

  test('parse PLI event', ({ assert }) => {
    const service = new CoTService()
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <event version="2.0" uid="ATAK-123" type="a-f-G-U-C"
        time="2024-01-01T00:00:00Z" start="2024-01-01T00:00:00Z"
        stale="2024-01-01T00:02:00Z" how="m-g">
        <point lat="38.8977" lon="-77.0365" hae="100" ce="35" le="999999"/>
        <detail>
          <contact callsign="Alpha-1"/>
          <__group name="Red" role="Team Lead"/>
        </detail>
      </event>`

    const event = service.parseEvent(xml)
    assert.isNotNull(event)
    assert.equal(event!.uid, 'ATAK-123')
    assert.equal(event!.type, 'a-f-G-U-C')
    assert.closeTo(event!.latitude, 38.8977, 0.001)
    assert.closeTo(event!.longitude, -77.0365, 0.001)
    assert.equal(event!.altitude, 100)
    assert.equal(event!.callsign, 'Alpha-1')
    assert.equal(event!.team, 'Red')
    assert.equal(event!.role, 'Team Lead')
  })

  test('parse GeoChat event', ({ assert }) => {
    const service = new CoTService()
    const xml = `<event version="2.0" uid="GeoChat.123" type="b-t-f"
      time="2024-01-01T12:00:00Z" start="2024-01-01T12:00:00Z"
      stale="2024-01-02T12:00:00Z" how="h-e">
      <point lat="38.89" lon="-77.03" hae="0" ce="999999" le="999999"/>
      <detail>
        <contact callsign="Bravo-2"/>
        <remarks>Water supply low at staging area</remarks>
      </detail>
    </event>`

    const event = service.parseEvent(xml)
    assert.isNotNull(event)
    assert.isTrue(service.isGeoChat(event!))
    assert.isFalse(service.isPLI(event!))

    const chat = service.extractGeoChat(event!)
    assert.isNotNull(chat)
    assert.equal(chat!.sender, 'Bravo-2')
    assert.equal(chat!.message, 'Water supply low at staging area')
  })

  test('isPLI identifies friendly ground unit', ({ assert }) => {
    const service = new CoTService()
    const event = service.parseEvent(
      '<event version="2.0" uid="test" type="a-f-G-U-C" time="2024-01-01T00:00:00Z" start="2024-01-01T00:00:00Z" stale="2024-01-01T00:02:00Z" how="m-g"><point lat="0" lon="0" hae="0" ce="0" le="0"/></event>'
    )
    assert.isNotNull(event)
    assert.isTrue(service.isPLI(event!))
    assert.isFalse(service.isGeoChat(event!))
  })

  test('extractPLI returns null for non-PLI event', ({ assert }) => {
    const service = new CoTService()
    const event = service.parseEvent(
      '<event version="2.0" uid="test" type="b-t-f" time="2024-01-01T00:00:00Z" start="2024-01-01T00:00:00Z" stale="2024-01-01T00:02:00Z" how="h-e"><point lat="0" lon="0" hae="0" ce="0" le="0"/></event>'
    )
    assert.isNotNull(event)
    assert.isNull(service.extractPLI(event!))
  })

  test('parseEvent returns null for invalid XML', ({ assert }) => {
    const service = new CoTService()
    assert.isNull(service.parseEvent('not xml'))
    assert.isNull(service.parseEvent('<div>hello</div>'))
  })
})

// --- CoT XML Generation Tests ---

test.group('CoTService — XML Generation', () => {
  test('generate PLI XML', ({ assert }) => {
    const service = new CoTService()
    const xml = service.generatePLI({
      uid: 'mesh-node1',
      callsign: 'Node-1',
      latitude: 38.8977,
      longitude: -77.0365,
      altitude: 50,
      team: 'Mesh',
    })

    assert.include(xml, 'uid="mesh-node1"')
    assert.include(xml, 'type="a-f-G-U-C"')
    assert.include(xml, 'lat="38.8977"')
    assert.include(xml, 'lon="-77.0365"')
    assert.include(xml, 'callsign="Node-1"')
    assert.include(xml, 'name="Mesh"')
  })

  test('generate alert XML', ({ assert }) => {
    const service = new CoTService()
    const xml = service.generateAlert({
      uid: 'attic-incident-1',
      name: 'Building Fire',
      type: 'infrastructure_failure',
      latitude: 38.89,
      longitude: -77.03,
    })

    assert.include(xml, 'uid="attic-incident-1"')
    assert.include(xml, 'type="b-r-f-h-c"')
    assert.include(xml, 'Building Fire')
  })

  test('XML escaping works', ({ assert }) => {
    const service = new CoTService()
    const xml = service.generatePLI({
      uid: 'test',
      callsign: 'Alpha & "Beta" <1>',
      latitude: 0,
      longitude: 0,
    })
    assert.include(xml, 'Alpha &amp; &quot;Beta&quot; &lt;1&gt;')
  })
})

// --- CoTListener Tests ---

test.group('CoTListener — Unit Tests', () => {
  test('CoTListener instantiates', ({ assert }) => {
    const listener = new CoTListener()
    assert.isDefined(listener)
    assert.isFunction(listener.connect)
    assert.isFunction(listener.disconnect)
    assert.isFunction(listener.isConnected)
    assert.isFunction(listener.send)
  })

  test('isConnected returns false before connect', ({ assert }) => {
    const listener = new CoTListener()
    assert.isFalse(listener.isConnected())
  })
})

// --- CoTPublisher Tests ---

test.group('CoTPublisher — Unit Tests', () => {
  test('CoTPublisher instantiates', ({ assert }) => {
    const listener = new CoTListener()
    const publisher = new CoTPublisher(listener)
    assert.isDefined(publisher)
    assert.isFunction(publisher.publishMeshPositions)
    assert.isFunction(publisher.publishIncidentAlert)
  })

  test('publishIncidentAlert returns false when not connected', ({ assert }) => {
    const listener = new CoTListener()
    const publisher = new CoTPublisher(listener)
    const result = publisher.publishIncidentAlert({
      incidentId: 1,
      name: 'Test',
      type: 'other',
    })
    assert.isFalse(result)
  })

  test('publishMeshPositions returns 0 when not connected', async ({ assert }) => {
    const listener = new CoTListener()
    const publisher = new CoTPublisher(listener)
    const count = await publisher.publishMeshPositions()
    assert.equal(count, 0)
  })
})

// --- Docker Compose Tests ---

test.group('TAK Docker — Configuration', () => {
  test('docker-compose includes OpenTAKServer', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'docker-compose.yml'),
      'utf-8'
    )
    assert.include(content, 'opentakserver')
    assert.include(content, '8089')
    assert.include(content, 'tak')
    assert.include(content, 'tak_data')
  })
})
