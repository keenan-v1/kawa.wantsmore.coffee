/**
 * Production-safe database migration script
 * Uses drizzle-orm's migrate() which only requires production dependencies
 * (no drizzle-kit needed at runtime)
 */
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'db-migrate' })

const __dirname = dirname(fileURLToPath(import.meta.url))

const connectionString = process.env.DATABASE_URL || ''

if (connectionString.length === 0) {
  log.error('DATABASE_URL environment variable is not set')
  process.exit(1)
}

async function runMigrations() {
  log.info('Starting database migrations')

  // Use max: 1 connection for migrations
  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client)

  // Migrations folder is relative to this script's location
  // In production: /app/apps/api/dist/scripts/db-migrate.js -> /app/apps/api/drizzle
  const migrationsFolder = join(__dirname, '..', '..', 'drizzle')
  log.info({ migrationsFolder }, 'Using migrations folder')

  try {
    await migrate(db, { migrationsFolder })
    log.info('Migrations completed successfully')
  } catch (error) {
    log.error({ err: error }, 'Migration failed')
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
