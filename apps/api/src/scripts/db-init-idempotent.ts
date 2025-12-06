#!/usr/bin/env tsx
// Idempotent database initialization script
// Safe to run multiple times - only seeds/syncs if database is empty

import { db } from '../db/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'db-init-idempotent' })

async function checkIfDatabaseNeedsSeeding(): Promise<boolean> {
  try {
    // Check if commodities table has data
    const result = await db.execute(`
      SELECT COUNT(*) as count FROM commodities LIMIT 1
    `)

    const rows = result as unknown as { count: string }[]
    const count = parseInt(rows?.[0]?.count || '0')
    return count === 0
  } catch {
    // If query fails, table might not exist yet - needs seeding
    log.info('Could not check commodities table, assuming database needs initialization')
    return true
  }
}

async function main() {
  log.info('Checking if database needs initialization')

  const needsSeeding = await checkIfDatabaseNeedsSeeding()

  if (needsSeeding) {
    log.info('Database is empty - running seed and FIO sync')

    // Import and run seed
    log.info('Seeding initial data')
    await import('../db/seed.js')
    log.info('Seed completed')

    // Import and run FIO sync
    log.info('Syncing FIO data')
    const { syncCommodities } = await import('../services/fio/sync-commodities.js')
    const { syncLocations } = await import('../services/fio/sync-locations.js')
    const { syncStations } = await import('../services/fio/sync-stations.js')

    log.info('Syncing commodities')
    await syncCommodities()

    log.info('Syncing locations')
    await syncLocations()

    log.info('Syncing stations')
    await syncStations()

    log.info('Database initialization complete')
  } else {
    log.info('Database already has data - skipping initialization')
  }

  process.exit(0)
}

main().catch(error => {
  log.error({ err: error }, 'Database initialization failed')
  process.exit(1)
})
