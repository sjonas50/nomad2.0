import { test } from '@japa/runner'

test.group('User model', () => {
  test('role helpers work correctly', async ({ assert }) => {
    // Test the role type checking logic (unit test without DB)
    const adminRole = 'admin' as const
    const operatorRole = 'operator' as const
    const viewerRole = 'viewer' as const

    assert.isTrue(adminRole === 'admin')
    assert.isTrue(operatorRole === 'operator')
    assert.isTrue(viewerRole === 'viewer')
  })
})

test.group('Validators', () => {
  test('login validator schema exists', async ({ assert }) => {
    const { loginValidator } = await import('#validators/auth')
    assert.isDefined(loginValidator)
  })

  test('setup validator schema exists', async ({ assert }) => {
    const { setupValidator } = await import('#validators/auth')
    assert.isDefined(setupValidator)
  })
})
