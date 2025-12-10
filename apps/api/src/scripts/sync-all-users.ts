#!/usr/bin/env tsx
// CLI script to sync FIO inventory for all users with auto-sync enabled
// Usage: pnpm fio:sync:users

import { db, users, client } from '../db/index.js'
import { syncUserInventory } from '../services/fio/sync-user-inventory.js'
import { createLogger } from '../utils/logger.js'
import * as userSettingsService from '../services/userSettingsService.js'

const log = createLogger({ script: 'sync-all-users' })

interface UserToSync {
  userId: number
  username: string
  fioUsername: string
  fioApiKey: string
  excludedLocations: string[]
}

async function main() {
  log.info('Starting FIO user inventory sync')

  try {
    // Get all active users
    const allUsers = await db
      .select({
        userId: users.id,
        username: users.username,
      })
      .from(users)

    if (allUsers.length === 0) {
      log.info('No users found')
      return
    }

    // Filter users who have FIO credentials and auto-sync enabled
    const usersToSync: UserToSync[] = []

    for (const user of allUsers) {
      // Check if user has auto-sync enabled
      const fioAutoSync = (await userSettingsService.getSetting(
        user.userId,
        'fio.autoSync'
      )) as boolean

      if (!fioAutoSync) {
        continue
      }

      // Get FIO credentials (using internal API that includes sensitive data)
      const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(user.userId)

      if (!fioUsername || !fioApiKey) {
        continue
      }

      // Get excluded locations
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
      return
    }

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
