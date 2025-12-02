// Sync user inventory from FIO API to database
import { eq, and } from 'drizzle-orm'
import { db, fioInventory, locations, commodities } from '../../db/index.js'
import { FioClient } from './client.js'
import { parseCsvTyped } from './csv-parser.js'
import type { FioInventoryItem } from './types.js'
import type { SyncResult } from './sync-types.js'

export interface UserInventorySyncResult extends SyncResult {
  skippedUnknownLocations: number
  skippedUnknownCommodities: number
}

/**
 * Sync a user's inventory from FIO API
 * @param userId - The internal user ID
 * @param fioApiKey - User's FIO API key
 * @param fioUsername - User's FIO username
 */
export async function syncUserInventory(
  userId: number,
  fioApiKey: string,
  fioUsername: string
): Promise<UserInventorySyncResult> {
  const result: UserInventorySyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
    skippedUnknownLocations: 0,
    skippedUnknownCommodities: 0,
  }

  try {
    // Create a client instance for this user's request
    const client = new FioClient()

    console.log(`📦 Fetching inventory for ${fioUsername} from FIO API...`)
    const csvData = await client.getUserInventory(fioApiKey, fioUsername)

    console.log('🔄 Parsing CSV data...')
    const inventoryItems = parseCsvTyped<FioInventoryItem>(csvData)

    console.log(`📊 Found ${inventoryItems.length} inventory items`)

    // Get existing locations and commodities for validation
    const existingLocations = await db.select({ id: locations.id }).from(locations)
    const locationIds = new Set(existingLocations.map(l => l.id))

    const existingCommodities = await db.select({ ticker: commodities.ticker }).from(commodities)
    const commodityTickers = new Set(existingCommodities.map(c => c.ticker))

    // Group inventory by location and commodity (combine same items at same location)
    const groupedInventory = new Map<string, { locationId: string; ticker: string; amount: number }>()

    for (const item of inventoryItems) {
      // Skip ship storage for now (we only want base/station storage)
      if (item.Type === 'SHIP') {
        continue
      }

      const locationId = item.AddressableId
      const ticker = item.MaterialTicker

      // Skip if location doesn't exist
      if (!locationIds.has(locationId)) {
        result.skippedUnknownLocations++
        continue
      }

      // Skip if commodity doesn't exist
      if (!commodityTickers.has(ticker)) {
        result.skippedUnknownCommodities++
        continue
      }

      const key = `${locationId}:${ticker}`
      const existing = groupedInventory.get(key)
      if (existing) {
        existing.amount += item.Amount
      } else {
        groupedInventory.set(key, {
          locationId,
          ticker,
          amount: item.Amount,
        })
      }
    }

    console.log(`📊 Grouped into ${groupedInventory.size} unique location/commodity pairs`)

    // Clear existing inventory for this user before inserting new data
    await db.delete(fioInventory).where(eq(fioInventory.userId, userId))

    // Insert grouped inventory
    const now = new Date()
    for (const [, item] of groupedInventory) {
      try {
        await db.insert(fioInventory).values({
          userId,
          commodityTicker: item.ticker,
          quantity: item.amount,
          locationId: item.locationId,
          lastSyncedAt: now,
        })
        result.inserted++
      } catch (error) {
        const errorMsg = `Failed to insert inventory for ${item.ticker} at ${item.locationId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        console.error(errorMsg)
      }
    }

    result.success = result.errors.length === 0
    console.log(`✅ Synced ${result.inserted} inventory entries for ${fioUsername}`)

    if (result.skippedUnknownLocations > 0) {
      console.log(`⚠️  Skipped ${result.skippedUnknownLocations} items at unknown locations`)
    }
    if (result.skippedUnknownCommodities > 0) {
      console.log(`⚠️  Skipped ${result.skippedUnknownCommodities} items with unknown commodities`)
    }
    if (result.errors.length > 0) {
      console.log(`⚠️  ${result.errors.length} errors occurred`)
    }

    return result
  } catch (error) {
    const errorMsg = `Failed to sync inventory for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    console.error(errorMsg)
    return result
  }
}

/**
 * Get a user's synced FIO inventory
 */
export async function getUserFioInventory(userId: number) {
  return db
    .select({
      id: fioInventory.id,
      commodityTicker: fioInventory.commodityTicker,
      quantity: fioInventory.quantity,
      locationId: fioInventory.locationId,
      lastSyncedAt: fioInventory.lastSyncedAt,
    })
    .from(fioInventory)
    .where(eq(fioInventory.userId, userId))
}
