#!/usr/bin/env tsx
// Idempotent database initialization script
// Safe to run multiple times - only seeds/syncs if database is empty

import { db } from '../db/index.js'

async function checkIfDatabaseNeedsSeeding(): Promise<boolean> {
  try {
    // Check if commodities table has data
    const result = (await db.execute(`
      SELECT COUNT(*) as count FROM commodities LIMIT 1
    `)) as any

    const count = parseInt(result.rows?.[0]?.count || '0')
    return count === 0
  } catch (error) {
    // If query fails, table might not exist yet - needs seeding
    console.log('Could not check commodities table, assuming database needs initialization')
    return true
  }
}

async function main() {
  console.log('🔍 Checking if database needs initialization...')

  const needsSeeding = await checkIfDatabaseNeedsSeeding()

  if (needsSeeding) {
    console.log('📦 Database is empty - running seed and FIO sync...')

    // Import and run seed
    console.log('🌱 Seeding initial data...')
    await import('../db/seed.js')
    console.log('✅ Seed completed')

    // Import and run FIO sync
    console.log('🔄 Syncing FIO data...')
    const { syncCommodities } = await import('../services/fio/sync-commodities.js')
    const { syncLocations } = await import('../services/fio/sync-locations.js')
    const { syncStations } = await import('../services/fio/sync-stations.js')

    console.log('=== Syncing Commodities ===')
    await syncCommodities()

    console.log('\n=== Syncing Locations ===')
    await syncLocations()

    console.log('\n=== Syncing Stations ===')
    await syncStations()

    console.log('\n✅ Database initialization complete!')
  } else {
    console.log('⏭️  Database already has data - skipping initialization')
  }

  process.exit(0)
}

main().catch(error => {
  console.error('❌ Database initialization failed:', error)
  process.exit(1)
})
