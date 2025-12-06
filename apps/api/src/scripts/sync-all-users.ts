#!/usr/bin/env tsx
// CLI script to sync FIO inventory for all users with auto-sync enabled
// Usage: pnpm fio:sync:users

import { db, users, userSettings, client } from '../db/index.js'
import { eq, and, isNotNull } from 'drizzle-orm'
import { syncUserInventory } from '../services/fio/sync-user-inventory.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'sync-all-users' })

interface UserToSync {
  userId: number
  username: string
  fioUsername: string
  fioApiKey: string
  fioExcludedLocations: string[] | null
}

async function main() {
  log.info('Starting FIO user inventory sync')

  try {
    // Find all users with:
    // - fioAutoSync = true (or null, which defaults to true)
    // - fioApiKey set
    // - fioUsername set
    const usersToSync = await db
      .select({
        userId: users.id,
        username: users.username,
        fioUsername: userSettings.fioUsername,
        fioApiKey: userSettings.fioApiKey,
        fioExcludedLocations: userSettings.fioExcludedLocations,
      })
      .from(users)
      .innerJoin(userSettings, eq(users.id, userSettings.userId))
      .where(
        and(
          // fioAutoSync is true (default is true, so we include null as well)
          // Drizzle doesn't have a direct "is true or is null" so we check for not false
          eq(userSettings.fioAutoSync, true),
          // Must have FIO credentials configured
          isNotNull(userSettings.fioApiKey),
          isNotNull(userSettings.fioUsername)
        )
      )

    if (usersToSync.length === 0) {
      log.info('No users found with auto-sync enabled and FIO credentials configured')
      return
    }

    log.info({ userCount: usersToSync.length }, 'Found users to sync')

    let successCount = 0
    let failCount = 0

    for (const user of usersToSync as UserToSync[]) {
      log.info({ userId: user.userId }, 'Syncing user inventory')

      try {
        const result = await syncUserInventory(user.userId, user.fioApiKey, user.fioUsername, {
          excludedLocations: user.fioExcludedLocations ?? [],
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

    log.info({ successCount, failCount }, 'FIO user sync complete')

    // Exit with error code if any syncs failed
    if (failCount > 0) {
      process.exit(1)
    }
  } catch (error) {
    log.error({ err: error }, 'Fatal error during sync')
    process.exit(1)
  } finally {
    // Close postgres connection
    await client.end()
  }
}

main()
