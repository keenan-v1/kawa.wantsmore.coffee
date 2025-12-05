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

const __dirname = dirname(fileURLToPath(import.meta.url))

const connectionString = process.env.DATABASE_URL || ''

if (connectionString.length === 0) {
  console.error('DATABASE_URL environment variable is not set')
  process.exit(1)
}

async function runMigrations() {
  console.log('Starting database migrations...')

  // Use max: 1 connection for migrations
  const client = postgres(connectionString, { max: 1 })
  const db = drizzle(client)

  // Migrations folder is relative to this script's location
  // In production: /app/apps/api/dist/scripts/db-migrate.js -> /app/apps/api/drizzle
  const migrationsFolder = join(__dirname, '..', '..', 'drizzle')
  console.log(`Migrations folder: ${migrationsFolder}`)

  try {
    await migrate(db, { migrationsFolder })
    console.log('Migrations completed successfully')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
