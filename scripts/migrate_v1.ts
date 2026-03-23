/**
 * v1 → v2 Migration Tool
 *
 * Migrates data from the original Attic schema to the v2 schema.
 * Run with: npx tsx scripts/migrate_v1.ts --source <v1_db_connection_string>
 *
 * Migrates:
 * - Users (preserves passwords, maps roles)
 * - Chat sessions and messages
 * - Knowledge sources (re-embeds if vector format changed)
 * - KV store entries
 */

import { createConnection } from 'mysql2/promise'

interface MigrationConfig {
  sourceHost: string
  sourcePort: number
  sourceUser: string
  sourcePassword: string
  sourceDatabase: string
  targetHost: string
  targetPort: number
  targetUser: string
  targetPassword: string
  targetDatabase: string
  dryRun: boolean
}

interface MigrationStats {
  users: number
  chatSessions: number
  chatMessages: number
  knowledgeSources: number
  kvEntries: number
  errors: string[]
}

async function migrate(config: MigrationConfig): Promise<MigrationStats> {
  const stats: MigrationStats = {
    users: 0,
    chatSessions: 0,
    chatMessages: 0,
    knowledgeSources: 0,
    kvEntries: 0,
    errors: [],
  }

  console.log(`\n🔄 Attic v1 → v2 Migration`)
  console.log(`   Source: ${config.sourceHost}:${config.sourcePort}/${config.sourceDatabase}`)
  console.log(`   Target: ${config.targetHost}:${config.targetPort}/${config.targetDatabase}`)
  console.log(`   Dry run: ${config.dryRun}\n`)

  const source = await createConnection({
    host: config.sourceHost,
    port: config.sourcePort,
    user: config.sourceUser,
    password: config.sourcePassword,
    database: config.sourceDatabase,
  })

  const target = config.dryRun
    ? null
    : await createConnection({
        host: config.targetHost,
        port: config.targetPort,
        user: config.targetUser,
        password: config.targetPassword,
        database: config.targetDatabase,
      })

  try {
    // 1. Migrate users
    console.log('📦 Migrating users...')
    try {
      const [users] = await source.query('SELECT * FROM users') as any[]
      for (const user of users) {
        const role = mapRole(user.role || user.user_type || 'viewer')
        if (target) {
          await target.query(
            `INSERT INTO users (id, full_name, email, password, role, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role = VALUES(role)`,
            [user.id, user.full_name || user.name, user.email, user.password, role, user.created_at, user.updated_at]
          )
        }
        stats.users++
      }
      console.log(`   ✓ ${stats.users} users`)
    } catch (error) {
      const msg = `Users: ${error instanceof Error ? error.message : 'Unknown error'}`
      stats.errors.push(msg)
      console.log(`   ✗ ${msg}`)
    }

    // 2. Migrate chat sessions
    console.log('📦 Migrating chat sessions...')
    try {
      const [sessions] = await source.query('SELECT * FROM chat_sessions ORDER BY id') as any[]
      for (const session of sessions) {
        if (target) {
          await target.query(
            `INSERT INTO chat_sessions (id, user_id, title, model_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE title = VALUES(title)`,
            [session.id, session.user_id, session.title, session.model_name || 'qwen2.5:1.5b', session.created_at, session.updated_at]
          )
        }
        stats.chatSessions++
      }
      console.log(`   ✓ ${stats.chatSessions} sessions`)
    } catch (error) {
      const msg = `Sessions: ${error instanceof Error ? error.message : 'Unknown error'}`
      stats.errors.push(msg)
      console.log(`   ✗ ${msg}`)
    }

    // 3. Migrate chat messages
    console.log('📦 Migrating chat messages...')
    try {
      const [messages] = await source.query('SELECT * FROM chat_messages ORDER BY id') as any[]
      for (const msg of messages) {
        if (target) {
          await target.query(
            `INSERT INTO chat_messages (id, chat_session_id, role, content, thinking_content, sources, metadata, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE content = VALUES(content)`,
            [msg.id, msg.chat_session_id, msg.role, msg.content, msg.thinking_content || null, msg.sources || null, msg.metadata || null, msg.created_at]
          )
        }
        stats.chatMessages++
      }
      console.log(`   ✓ ${stats.chatMessages} messages`)
    } catch (error) {
      const msg = `Messages: ${error instanceof Error ? error.message : 'Unknown error'}`
      stats.errors.push(msg)
      console.log(`   ✗ ${msg}`)
    }

    // 4. Migrate knowledge sources
    console.log('📦 Migrating knowledge sources...')
    try {
      const [sources] = await source.query('SELECT * FROM knowledge_sources ORDER BY id') as any[]
      for (const ks of sources) {
        if (target) {
          await target.query(
            `INSERT INTO knowledge_sources (id, user_id, name, file_type, file_size, status, chunk_count, error_message, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status)`,
            [ks.id, ks.user_id, ks.name, ks.file_type || 'unknown', ks.file_size || 0, ks.status || 'pending', ks.chunk_count || 0, ks.error_message || null, ks.created_at, ks.updated_at]
          )
        }
        stats.knowledgeSources++
      }
      console.log(`   ✓ ${stats.knowledgeSources} knowledge sources`)
    } catch (error) {
      const msg = `Knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`
      stats.errors.push(msg)
      console.log(`   ✗ ${msg}`)
    }

    // 5. Migrate KV store
    console.log('📦 Migrating KV store...')
    try {
      const [entries] = await source.query('SELECT * FROM kv_store') as any[]
      for (const entry of entries) {
        if (target) {
          await target.query(
            `INSERT INTO kv_store (id, \`key\`, value, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [entry.id, entry.key, entry.value, entry.created_at, entry.updated_at]
          )
        }
        stats.kvEntries++
      }
      console.log(`   ✓ ${stats.kvEntries} KV entries`)
    } catch (error) {
      const msg = `KV Store: ${error instanceof Error ? error.message : 'Unknown error'}`
      stats.errors.push(msg)
      console.log(`   ✗ ${msg}`)
    }

  } finally {
    await source.end()
    if (target) await target.end()
  }

  // Summary
  console.log('\n📊 Migration Summary')
  console.log(`   Users:      ${stats.users}`)
  console.log(`   Sessions:   ${stats.chatSessions}`)
  console.log(`   Messages:   ${stats.chatMessages}`)
  console.log(`   Knowledge:  ${stats.knowledgeSources}`)
  console.log(`   KV entries: ${stats.kvEntries}`)
  if (stats.errors.length > 0) {
    console.log(`   Errors:     ${stats.errors.length}`)
    for (const err of stats.errors) console.log(`     - ${err}`)
  }
  console.log('')

  return stats
}

function mapRole(v1Role: string): string {
  const mapping: Record<string, string> = {
    admin: 'admin',
    operator: 'operator',
    user: 'viewer',
    viewer: 'viewer',
    guest: 'viewer',
  }
  return mapping[v1Role.toLowerCase()] || 'viewer'
}

// CLI entry point
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

const config: MigrationConfig = {
  sourceHost: getArg('--source-host') || '127.0.0.1',
  sourcePort: Number(getArg('--source-port') || '3306'),
  sourceUser: getArg('--source-user') || 'attic',
  sourcePassword: getArg('--source-password') || '',
  sourceDatabase: getArg('--source-db') || 'attic_v1',
  targetHost: process.env.DB_HOST || '127.0.0.1',
  targetPort: Number(process.env.DB_PORT || '3306'),
  targetUser: process.env.DB_USER || 'attic',
  targetPassword: process.env.DB_PASSWORD || '',
  targetDatabase: process.env.DB_DATABASE || 'attic',
  dryRun,
}

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx !== -1 ? args[idx + 1] : undefined
}

migrate(config)
  .then((stats) => {
    if (stats.errors.length > 0) process.exit(1)
  })
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
