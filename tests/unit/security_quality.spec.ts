import { test } from '@japa/runner'
import SecurityMiddleware from '#middleware/security_middleware'
import HealthService from '#services/health_service'
import BackupService from '#services/backup_service'

test.group('SecurityMiddleware — Unit Tests', () => {
  test('isUrlSafe blocks localhost', ({ assert }) => {
    assert.isFalse(SecurityMiddleware.isUrlSafe('http://localhost:3306'))
    assert.isFalse(SecurityMiddleware.isUrlSafe('http://127.0.0.1:8080'))
    assert.isFalse(SecurityMiddleware.isUrlSafe('http://10.0.0.1/admin'))
    assert.isFalse(SecurityMiddleware.isUrlSafe('http://172.16.0.1'))
    assert.isFalse(SecurityMiddleware.isUrlSafe('http://192.168.1.1'))
    assert.isFalse(SecurityMiddleware.isUrlSafe('http://169.254.169.254/metadata'))
    assert.isFalse(SecurityMiddleware.isUrlSafe('http://0.0.0.0'))
  })

  test('isUrlSafe allows external URLs', ({ assert }) => {
    assert.isTrue(SecurityMiddleware.isUrlSafe('https://example.com'))
    assert.isTrue(SecurityMiddleware.isUrlSafe('https://download.kiwix.org/zim/wikipedia.zim'))
    assert.isTrue(SecurityMiddleware.isUrlSafe('https://cdn.example.com/file.bin'))
  })

  test('isUrlSafe rejects invalid URLs', ({ assert }) => {
    assert.isFalse(SecurityMiddleware.isUrlSafe('not-a-url'))
    assert.isFalse(SecurityMiddleware.isUrlSafe(''))
  })

  test('isAllowedUploadType accepts valid types', ({ assert }) => {
    assert.isTrue(SecurityMiddleware.isAllowedUploadType('application/pdf'))
    assert.isTrue(SecurityMiddleware.isAllowedUploadType('text/plain'))
    assert.isTrue(SecurityMiddleware.isAllowedUploadType('text/html'))
    assert.isTrue(SecurityMiddleware.isAllowedUploadType('text/csv'))
    assert.isTrue(SecurityMiddleware.isAllowedUploadType('text/markdown'))
    assert.isTrue(SecurityMiddleware.isAllowedUploadType('application/json'))
  })

  test('isAllowedUploadType rejects dangerous types', ({ assert }) => {
    assert.isFalse(SecurityMiddleware.isAllowedUploadType('application/x-executable'))
    assert.isFalse(SecurityMiddleware.isAllowedUploadType('application/javascript'))
    assert.isFalse(SecurityMiddleware.isAllowedUploadType('image/png'))
    assert.isFalse(SecurityMiddleware.isAllowedUploadType('application/zip'))
    assert.isFalse(SecurityMiddleware.isAllowedUploadType(''))
  })

  test('SecurityMiddleware instantiates correctly', ({ assert }) => {
    const middleware = new SecurityMiddleware()
    assert.isDefined(middleware)
    assert.isFunction(middleware.handle)
  })
})

test.group('HealthService — Unit Tests', () => {
  test('instantiates correctly', ({ assert }) => {
    const service = new HealthService()
    assert.isDefined(service)
    assert.isFunction(service.check)
    assert.isFunction(service.getDegradationNotice)
  })

  test('check returns expected structure', async ({ assert }) => {
    const service = new HealthService()
    const health = await service.check()

    assert.properties(health, ['overall', 'services', 'capabilities'])
    assert.isArray(health.services)
    assert.isAbove(health.services.length, 0)
    assert.include(['healthy', 'degraded', 'unhealthy'], health.overall)

    assert.properties(health.capabilities, [
      'chat', 'rag', 'graphRag', 'embedding', 'zimExtraction', 'entityExtraction',
    ])

    for (const svc of health.services) {
      assert.properties(svc, ['name', 'status'])
      assert.include(['up', 'down', 'degraded'], svc.status)
    }
  })

  test('getDegradationNotice returns null or string', async ({ assert }) => {
    const service = new HealthService()
    const notice = await service.getDegradationNotice()
    if (notice !== null) {
      assert.isString(notice)
      assert.isAbove(notice.length, 0)
    }
  })
})

test.group('BackupService — Unit Tests', () => {
  test('instantiates correctly', ({ assert }) => {
    const service = new BackupService()
    assert.isDefined(service)
    assert.isFunction(service.backupMysql)
    assert.isFunction(service.backupQdrant)
    assert.isFunction(service.listBackups)
    assert.isFunction(service.deleteBackup)
    assert.isFunction(service.restoreMysql)
  })

  test('listBackups returns array', async ({ assert }) => {
    const service = new BackupService()
    const backups = await service.listBackups()
    assert.isArray(backups)
  })
})

test.group('RetrievalFeedback Model — Unit Tests', () => {
  test('model exists', async ({ assert }) => {
    const { default: RetrievalFeedback } = await import('#models/retrieval_feedback')
    assert.isDefined(RetrievalFeedback)
    assert.equal(RetrievalFeedback.table, 'retrieval_feedback')
  })
})

test.group('AuditMiddleware — Unit Tests', () => {
  test('instantiates correctly', async ({ assert }) => {
    const { default: AuditMiddleware } = await import('#middleware/audit_middleware')
    const middleware = new AuditMiddleware()
    assert.isDefined(middleware)
    assert.isFunction(middleware.handle)
  })
})
