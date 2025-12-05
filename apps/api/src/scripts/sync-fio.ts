#!/usr/bin/env tsx
// CLI script to sync FIO data to database

import { syncCommodities } from '../services/fio/sync-commodities.js'
import { syncLocations } from '../services/fio/sync-locations.js'
import { syncStations } from '../services/fio/sync-stations.js'
import { client } from '../db/index.js'

const SYNC_TYPES = ['commodities', 'locations', 'stations', 'all'] as const
type SyncType = (typeof SYNC_TYPES)[number]

async function main() {
  const args = process.argv.slice(2)
  const syncType: SyncType = (args[0] as SyncType) || 'all'

  if (!SYNC_TYPES.includes(syncType)) {
    console.error(`Invalid sync type: ${syncType}`)
    console.error(`Valid types: ${SYNC_TYPES.join(', ')}`)
    process.exit(1)
  }

  console.log('🚀 Starting FIO data sync...')
  console.log(`📋 Sync type: ${syncType}\n`)

  try {
    if (syncType === 'commodities' || syncType === 'all') {
      console.log('=== Syncing Commodities ===')
      const commoditiesResult = await syncCommodities()

      if (commoditiesResult.success) {
        console.log(`✅ Commodities sync completed successfully`)
        console.log(`   Inserted/Updated: ${commoditiesResult.inserted}`)
      } else {
        console.error(`❌ Commodities sync failed`)
        console.error(`   Errors: ${commoditiesResult.errors.length}`)
        commoditiesResult.errors.forEach(err => console.error(`   - ${err}`))
      }
      console.log('')
    }

    if (syncType === 'locations' || syncType === 'all') {
      console.log('=== Syncing Locations (Planets) ===')
      const locationsResult = await syncLocations()

      if (locationsResult.success) {
        console.log(`✅ Locations sync completed successfully`)
        console.log(`   Inserted/Updated: ${locationsResult.inserted}`)
      } else {
        console.error(`❌ Locations sync failed`)
        console.error(`   Errors: ${locationsResult.errors.length}`)
        locationsResult.errors.forEach(err => console.error(`   - ${err}`))
      }
      console.log('')
    }

    if (syncType === 'stations' || syncType === 'all') {
      console.log('=== Syncing Stations (Commodity Exchanges) ===')
      const stationsResult = await syncStations()

      if (stationsResult.success) {
        console.log(`✅ Stations sync completed successfully`)
        console.log(`   Inserted/Updated: ${stationsResult.inserted}`)
      } else {
        console.error(`❌ Stations sync failed`)
        console.error(`   Errors: ${stationsResult.errors.length}`)
        stationsResult.errors.forEach(err => console.error(`   - ${err}`))
      }
      console.log('')
    }

    console.log('✨ FIO sync complete!')
  } catch (error) {
    console.error('💥 Fatal error during sync:', error)
    process.exit(1)
  } finally {
    // Close postgres connection
    await client.end()
  }
}

main()
