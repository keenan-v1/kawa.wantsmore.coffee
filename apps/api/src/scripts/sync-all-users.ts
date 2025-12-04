#!/usr/bin/env tsx
// CLI script to sync FIO inventory for all users with auto-sync enabled
// Usage: pnpm fio:sync:users

import { db, users, userSettings } from '../db/index.js'
import { eq, and, isNotNull } from 'drizzle-orm'
import { syncUserInventory } from '../services/fio/sync-user-inventory.js'
import postgres from 'postgres'

interface UserToSync {
  userId: number
  username: string
  fioUsername: string
  fioApiKey: string
  fioExcludedLocations: string[] | null
}

async function main() {
  console.log('🚀 Starting FIO user inventory sync...')
  console.log('')

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
      console.log('📋 No users found with auto-sync enabled and FIO credentials configured')
      return
    }

    console.log(`📋 Found ${usersToSync.length} user(s) to sync`)
    console.log('')

    let successCount = 0
    let failCount = 0

    for (const user of usersToSync as UserToSync[]) {
      console.log(`=== Syncing ${user.username} (FIO: ${user.fioUsername}) ===`)

      try {
        const result = await syncUserInventory(user.userId, user.fioApiKey, user.fioUsername, {
          excludedLocations: user.fioExcludedLocations ?? [],
        })

        if (result.success) {
          console.log(`✅ Sync completed for ${user.username}`)
          console.log(`   Storage locations: ${result.storageLocations}`)
          console.log(`   Inventory items: ${result.inserted}`)
          if (result.skippedExcludedLocations > 0) {
            console.log(`   Skipped (excluded): ${result.skippedExcludedLocations}`)
          }
          if (result.skippedUnknownLocations > 0) {
            console.log(`   Skipped (unknown locations): ${result.skippedUnknownLocations}`)
          }
          if (result.skippedUnknownCommodities > 0) {
            console.log(`   Skipped (unknown commodities): ${result.skippedUnknownCommodities}`)
          }
          successCount++
        } else {
          console.error(`❌ Sync failed for ${user.username}`)
          console.error(`   Errors: ${result.errors.length}`)
          result.errors.forEach(err => console.error(`   - ${err}`))
          failCount++
        }
      } catch (error) {
        console.error(`❌ Error syncing ${user.username}:`, error)
        failCount++
      }

      console.log('')
    }

    console.log('=== Summary ===')
    console.log(`✅ Successful: ${successCount}`)
    if (failCount > 0) {
      console.log(`❌ Failed: ${failCount}`)
    }
    console.log('')
    console.log('✨ FIO user sync complete!')

    // Exit with error code if any syncs failed
    if (failCount > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('💥 Fatal error during sync:', error)
    process.exit(1)
  } finally {
    // Close postgres connection
    await postgres(process.env.DATABASE_URL!).end()
  }
}

main()
