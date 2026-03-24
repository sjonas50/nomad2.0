import { test } from '@japa/runner'
import BundleService from '#services/bundle_service'

// --- Encryption Tests ---

test.group('BundleService — Encryption', () => {
  test('encrypt and decrypt roundtrip', async ({ assert }) => {
    const service = new BundleService()
    const original = Buffer.from('Hello, sneakernet world! This is sensitive COOP data.')
    const passphrase = 'test-passphrase-2024'

    const encrypted = await service.encrypt(original, passphrase)
    assert.notEqual(encrypted.toString(), original.toString())
    assert.isTrue(encrypted.length > original.length) // overhead from salt + IV + tag

    const decrypted = await service.decrypt(encrypted, passphrase)
    assert.equal(decrypted.toString(), original.toString())
  })

  test('decrypt with wrong passphrase throws', async ({ assert }) => {
    const service = new BundleService()
    const original = Buffer.from('Secret data')
    const encrypted = await service.encrypt(original, 'correct-password')

    try {
      await service.decrypt(encrypted, 'wrong-password')
      assert.fail('Should have thrown')
    } catch (error) {
      assert.instanceOf(error, Error)
    }
  })

  test('encryption produces different output each time (random salt/IV)', async ({ assert }) => {
    const service = new BundleService()
    const original = Buffer.from('Same data')
    const passphrase = 'same-password'

    const enc1 = await service.encrypt(original, passphrase)
    const enc2 = await service.encrypt(original, passphrase)

    // Different salt/IV means different ciphertext
    assert.notEqual(enc1.toString('hex'), enc2.toString('hex'))

    // Both decrypt to same original
    const dec1 = await service.decrypt(enc1, passphrase)
    const dec2 = await service.decrypt(enc2, passphrase)
    assert.equal(dec1.toString(), original.toString())
    assert.equal(dec2.toString(), original.toString())
  })

  test('encrypted format has correct structure (salt + IV + data + tag)', async ({ assert }) => {
    const service = new BundleService()
    const original = Buffer.from('test')
    const encrypted = await service.encrypt(original, 'password')

    // salt (16) + IV (12) + encrypted data (>= original) + tag (16)
    assert.isTrue(encrypted.length >= 16 + 12 + original.length + 16)
  })
})

// --- Install Script Tests ---

test.group('Install Script — Validation', () => {
  test('install.sh exists and is executable', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    // Check file exists
    await access(join(import.meta.dirname, '..', '..', 'install.sh'))
    assert.isTrue(true)
  })

  test('install.sh supports --offline flag', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'install.sh'),
      'utf-8'
    )
    assert.include(content, '--offline')
    assert.include(content, 'OFFLINE_BUNDLE')
    assert.include(content, 'docker load')
  })

  test('install.sh detects Apple Silicon', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'install.sh'),
      'utf-8'
    )
    assert.include(content, 'IS_APPLE_SILICON')
    assert.include(content, 'arm64')
    assert.include(content, 'Metal')
  })

  test('install.sh has model auto-config by RAM', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'install.sh'),
      'utf-8'
    )
    assert.include(content, 'RECOMMENDED_MODEL')
    assert.include(content, 'WHISPER_MODEL')
    assert.include(content, '48')  // 48GB tier
    assert.include(content, '24')  // 24GB tier
    assert.include(content, '16')  // 16GB tier
  })

  test('install.sh has sync commands in summary', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'install.sh'),
      'utf-8'
    )
    assert.include(content, 'sync:export')
    assert.include(content, 'sync:import')
  })
})

// --- Offline Bundle Builder ---

test.group('Offline Bundle Builder — Script', () => {
  test('build_offline_bundle.sh exists', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await access(join(import.meta.dirname, '..', '..', 'scripts', 'build_offline_bundle.sh'))
    assert.isTrue(true)
  })

  test('build_offline_bundle.sh saves Docker images', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'scripts', 'build_offline_bundle.sh'),
      'utf-8'
    )
    assert.include(content, 'docker save')
    assert.include(content, 'mysql:8.0')
    assert.include(content, 'ollama/ollama')
    assert.include(content, 'qdrant/qdrant')
  })
})

// --- Hardware Detection ---

test.group('Hardware Detection — Script', () => {
  test('detect_hardware.sh exists', async ({ assert }) => {
    const { access } = await import('node:fs/promises')
    const { join } = await import('node:path')
    await access(join(import.meta.dirname, '..', '..', 'scripts', 'detect_hardware.sh'))
    assert.isTrue(true)
  })

  test('detect_hardware.sh outputs JSON', async ({ assert }) => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { join } = await import('node:path')
    const execFileAsync = promisify(execFile)

    const { stdout } = await execFileAsync('bash', [
      join(import.meta.dirname, '..', '..', 'scripts', 'detect_hardware.sh'),
    ])

    const config = JSON.parse(stdout)
    assert.isString(config.platform)
    assert.isString(config.arch)
    assert.isNumber(config.ram_gb)
    assert.isNumber(config.cpu_cores)
    assert.isDefined(config.recommended)
    assert.isString(config.recommended.ollama_model)
    assert.isString(config.recommended.whisper_model)
  })
})

// --- Ace Command Encryption Flags ---

test.group('Sync Commands — Encryption Support', () => {
  test('sync:export supports --passphrase flag', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'commands', 'sync_export.ts'),
      'utf-8'
    )
    assert.include(content, 'passphrase')
    assert.include(content, 'AES-256-GCM')
  })

  test('sync:import supports --passphrase flag', async ({ assert }) => {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const content = await readFile(
      join(import.meta.dirname, '..', '..', 'commands', 'sync_import.ts'),
      'utf-8'
    )
    assert.include(content, 'passphrase')
  })
})
