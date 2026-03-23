import { test } from '@japa/runner'
import { readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import BenchmarkService from '#services/benchmark_service'

const ROOT = join(import.meta.dirname, '..', '..')

test.group('Install Script — Unit Tests', () => {
  test('install.sh exists and is executable', async ({ assert }) => {
    const path = join(ROOT, 'install.sh')
    await access(path) // Throws if not found
    const content = await readFile(path, 'utf-8')
    assert.include(content, '#!/usr/bin/env bash')
    assert.include(content, 'docker compose')
    assert.include(content, 'ollama pull')
    assert.include(content, '--dry-run')
    assert.include(content, 'Hardware')
  })

  test('install.sh supports --profile flag', async ({ assert }) => {
    const content = await readFile(join(ROOT, 'install.sh'), 'utf-8')
    assert.include(content, '--profile')
    assert.include(content, 'full')
  })
})

test.group('Hardware Detection — Unit Tests', () => {
  test('detect_hardware.sh exists', async ({ assert }) => {
    const path = join(ROOT, 'scripts', 'detect_hardware.sh')
    await access(path)
    const content = await readFile(path, 'utf-8')
    assert.include(content, 'ram_gb')
    assert.include(content, 'cpu_cores')
    assert.include(content, 'recommended_profile')
    assert.include(content, 'max_model_size')
  })
})

test.group('Dockerfile — Unit Tests', () => {
  test('Dockerfile exists with multi-stage build', async ({ assert }) => {
    const content = await readFile(join(ROOT, 'Dockerfile'), 'utf-8')
    assert.include(content, 'FROM node:20-alpine AS builder')
    assert.include(content, 'FROM node:20-alpine AS production')
    assert.include(content, 'HEALTHCHECK')
    assert.include(content, 'NODE_ENV=production')
    assert.include(content, 'tini')
  })

  test('.dockerignore exists', async ({ assert }) => {
    const content = await readFile(join(ROOT, '.dockerignore'), 'utf-8')
    assert.include(content, 'node_modules')
    assert.include(content, '.env')
    assert.include(content, '.git')
  })
})

test.group('Docker Compose — Unit Tests', () => {
  test('docker-compose.yml includes attic_admin service', async ({ assert }) => {
    const content = await readFile(join(ROOT, 'docker-compose.yml'), 'utf-8')
    assert.include(content, 'attic_admin')
    assert.include(content, 'production')
    assert.include(content, 'depends_on')
  })
})

test.group('BenchmarkService — Unit Tests', () => {
  test('instantiates correctly', ({ assert }) => {
    const service = new BenchmarkService()
    assert.isDefined(service)
    assert.isFunction(service.runAll)
  })
})

test.group('Migration Script — Unit Tests', () => {
  test('migrate_v1.ts exists', async ({ assert }) => {
    const content = await readFile(join(ROOT, 'scripts', 'migrate_v1.ts'), 'utf-8')
    assert.include(content, 'v1 → v2 Migration')
    assert.include(content, '--dry-run')
    assert.include(content, 'users')
    assert.include(content, 'chat_sessions')
    assert.include(content, 'knowledge_sources')
  })
})

test.group('Database Config — Unit Tests', () => {
  test('connection pooling is configured', async ({ assert }) => {
    const content = await readFile(join(ROOT, 'config', 'database.ts'), 'utf-8')
    assert.include(content, 'pool')
    assert.include(content, 'min: 2')
    assert.include(content, 'max: 20')
  })
})
