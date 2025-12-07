#!/usr/bin/env tsx
// CLI script to sync FIO data to database

import { syncCommodities } from '../services/fio/sync-commodities.js'
import { syncLocations } from '../services/fio/sync-locations.js'
import { syncStations } from '../services/fio/sync-stations.js'
import { syncFioExchangePrices, type FioPriceField } from '../services/fio/sync-exchange-prices.js'
import { client } from '../db/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'sync-fio' })

const SYNC_TYPES = ['commodities', 'locations', 'stations', 'prices', 'all'] as const
type SyncType = (typeof SYNC_TYPES)[number]

const VALID_PRICE_FIELDS: FioPriceField[] = ['MMBuy', 'MMSell', 'PriceAverage', 'Ask', 'Bid']

async function main() {
  const args = process.argv.slice(2)
  const syncType: SyncType = (args[0] as SyncType) || 'all'

  if (!SYNC_TYPES.includes(syncType)) {
    log.error({ syncType, validTypes: SYNC_TYPES }, 'Invalid sync type')
    process.exit(1)
  }

  log.info({ syncType }, 'Starting FIO data sync')

  try {
    if (syncType === 'commodities' || syncType === 'all') {
      log.info('Syncing commodities')
      const commoditiesResult = await syncCommodities()

      if (commoditiesResult.success) {
        log.info({ inserted: commoditiesResult.inserted }, 'Commodities sync completed')
      } else {
        log.error(
          { errorCount: commoditiesResult.errors.length, errors: commoditiesResult.errors },
          'Commodities sync failed'
        )
      }
    }

    if (syncType === 'locations' || syncType === 'all') {
      log.info('Syncing locations (planets)')
      const locationsResult = await syncLocations()

      if (locationsResult.success) {
        log.info({ inserted: locationsResult.inserted }, 'Locations sync completed')
      } else {
        log.error(
          { errorCount: locationsResult.errors.length, errors: locationsResult.errors },
          'Locations sync failed'
        )
      }
    }

    if (syncType === 'stations' || syncType === 'all') {
      log.info('Syncing stations (commodity exchanges)')
      const stationsResult = await syncStations()

      if (stationsResult.success) {
        log.info({ inserted: stationsResult.inserted }, 'Stations sync completed')
      } else {
        log.error(
          { errorCount: stationsResult.errors.length, errors: stationsResult.errors },
          'Stations sync failed'
        )
      }
    }

    if (syncType === 'prices' || syncType === 'all') {
      // Get price field from args (optional, defaults to PriceAverage)
      const priceFieldArg = args[1]
      const priceField: FioPriceField =
        priceFieldArg && VALID_PRICE_FIELDS.includes(priceFieldArg as FioPriceField)
          ? (priceFieldArg as FioPriceField)
          : 'PriceAverage'

      log.info({ priceField }, 'Syncing FIO exchange prices')
      const pricesResult = await syncFioExchangePrices(undefined, priceField)

      if (pricesResult.success) {
        log.info(
          {
            totalUpdated: pricesResult.totalUpdated,
            totalSkipped: pricesResult.totalSkipped,
            exchanges: pricesResult.exchanges.map(e => ({
              code: e.exchangeCode,
              updated: e.pricesUpdated,
            })),
          },
          'Exchange prices sync completed'
        )
      } else {
        log.error(
          { errorCount: pricesResult.errors.length, errors: pricesResult.errors },
          'Exchange prices sync failed'
        )
      }
    }

    log.info('FIO sync complete')
  } catch (error) {
    log.error({ err: error }, 'Fatal error during sync')
    process.exit(1)
  } finally {
    // Close postgres connection
    await client.end()
  }
}

main()
