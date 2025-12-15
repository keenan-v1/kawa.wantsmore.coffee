#!/usr/bin/env tsx
// CLI script to sync FIO data to database

import { syncCommodities } from '../services/fio/sync-commodities.js'
import { syncLocations } from '../services/fio/sync-locations.js'
import { syncStations } from '../services/fio/sync-stations.js'
import { syncFioExchangePrices, type FioPriceField } from '../services/fio/sync-exchange-prices.js'
import { syncUserInventory } from '../services/fio/sync-user-inventory.js'
import { db, users, client } from '../db/index.js'
import * as userSettingsService from '../services/userSettingsService.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'sync-fio' })

const SYNC_TYPES = ['commodities', 'locations', 'stations', 'prices', 'users', 'all'] as const
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

    if (syncType === 'users' || syncType === 'all') {
      log.info('Syncing user inventories')

      // Get all active users
      const allUsers = await db
        .select({
          userId: users.id,
          username: users.username,
        })
        .from(users)

      // Filter users who have FIO credentials and auto-sync enabled
      const usersToSync: Array<{
        userId: number
        username: string
        fioUsername: string
        fioApiKey: string
        excludedLocations: string[]
      }> = []

      for (const user of allUsers) {
        const fioAutoSync = (await userSettingsService.getSetting(
          user.userId,
          'fio.autoSync'
        )) as boolean

        if (!fioAutoSync) {
          continue
        }

        const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(user.userId)

        if (!fioUsername || !fioApiKey) {
          continue
        }

        const excludedLocations = (await userSettingsService.getSetting(
          user.userId,
          'fio.excludedLocations'
        )) as string[]

        usersToSync.push({
          userId: user.userId,
          username: user.username,
          fioUsername,
          fioApiKey,
          excludedLocations: excludedLocations ?? [],
        })
      }

      if (usersToSync.length === 0) {
        log.info('No users found with FIO credentials and auto-sync enabled')
      } else {
        log.info({ userCount: usersToSync.length }, 'Found users to sync')

        let successCount = 0
        let failCount = 0

        for (const user of usersToSync) {
          log.info({ userId: user.userId }, 'Syncing user inventory')

          try {
            const result = await syncUserInventory(user.userId, user.fioApiKey, user.fioUsername, {
              excludedLocations: user.excludedLocations,
            })

            if (result.success) {
              log.info(
                {
                  userId: user.userId,
                  storageLocations: result.storageLocations,
                  inventoryItems: result.inserted,
                  skippedExcluded: result.skippedExcludedLocations || undefined,
                  skippedUnknownLocations: result.skippedUnknownLocations || undefined,
                  skippedUnknownCommodities: result.skippedUnknownCommodities || undefined,
                },
                'Sync completed for user'
              )
              successCount++
            } else {
              log.error(
                {
                  userId: user.userId,
                  errorCount: result.errors.length,
                  errors: result.errors,
                },
                'Sync failed for user'
              )
              failCount++
            }
          } catch (error) {
            log.error({ userId: user.userId, err: error }, 'Error syncing user')
            failCount++
          }
        }

        log.info({ successCount, failCount }, 'User inventory sync completed')
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
