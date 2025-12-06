// Sync user inventory from FIO API to database using GroupHub endpoint
// GroupHub provides NaturalId mapping and timestamps for all locations
import { eq } from 'drizzle-orm'
import { db, fioInventory, fioUserStorage, fioLocations, fioCommodities } from '../../db/index.js'
import { FioClient } from './client.js'
import type { FioGroupHubResponse, FioGroupHubStorage } from './types.js'
import type { SyncResult } from './sync-types.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger({ service: 'fio-sync', entity: 'user-inventory' })

export interface UserInventorySyncResult extends SyncResult {
  storageLocations: number
  skippedUnknownLocations: number
  skippedUnknownCommodities: number
  skippedExcludedLocations: number // Locations excluded by user preference
  fioLastSync: string | null // Most recent FIO sync timestamp from game
}

export interface SyncUserInventoryOptions {
  excludedLocations?: string[] // Location NaturalIds or Names to exclude
}

/**
 * Sync a user's inventory from FIO API using GroupHub endpoint
 *
 * Uses /fioweb/GroupHub which provides:
 * - Planet bases via PlayerModels[].Locations[] with LocationIdentifier (NaturalId)
 * - Station warehouses via CXWarehouses[] with WarehouseLocationNaturalId
 * - LastUpdated timestamps for each storage
 *
 * @param userId - The internal user ID
 * @param fioApiKey - User's FIO API key
 * @param fioUsername - User's FIO username
 * @param options - Sync options including excluded locations
 */
export async function syncUserInventory(
  userId: number,
  fioApiKey: string,
  fioUsername: string,
  options: SyncUserInventoryOptions = {}
): Promise<UserInventorySyncResult> {
  const result: UserInventorySyncResult = {
    success: false,
    inserted: 0,
    updated: 0,
    errors: [],
    storageLocations: 0,
    skippedUnknownLocations: 0,
    skippedUnknownCommodities: 0,
    skippedExcludedLocations: 0,
    fioLastSync: null,
  }

  // Normalize excluded locations to lowercase for case-insensitive matching
  const excludedLocations = new Set((options.excludedLocations || []).map(l => l.toLowerCase()))

  try {
    const client = new FioClient()

    // Fetch inventory from GroupHub endpoint
    log.info({ userId }, 'Fetching GroupHub data from FIO API')
    const groupHubData = await client.getGroupHub<FioGroupHubResponse>(fioApiKey, [fioUsername])

    // Build lookup maps for validation
    const existingLocations = await db
      .select({
        naturalId: fioLocations.naturalId,
      })
      .from(fioLocations)
    const locationIds = new Set(existingLocations.map(l => l.naturalId))

    const existingCommodities = await db
      .select({ ticker: fioCommodities.ticker })
      .from(fioCommodities)
    const commodityTickers = new Set(existingCommodities.map(c => c.ticker))

    // Clear existing storage and inventory for this user
    await db.delete(fioUserStorage).where(eq(fioUserStorage.userId, userId))
    // Inventory is deleted via cascade when storage is deleted

    const now = new Date()
    const timestamps: Date[] = [] // Collect timestamps to find most recent

    // Track unknown locations and commodities
    const unknownLocations = new Set<string>()
    const unknownCommodities = new Set<string>()
    // Track processed storages to avoid duplicates (location can appear in both CXWarehouses and PlayerModels)
    const processedStorages = new Set<string>()

    // Track excluded locations for logging
    const skippedExcluded = new Set<string>()

    // Helper to process a storage and its items
    const processStorage = async (
      locationId: string,
      locationName: string,
      storage: FioGroupHubStorage | null
    ) => {
      if (!storage || !storage.Items || storage.Items.length === 0) {
        return
      }

      // Skip if already processed (same location+type can appear in both CXWarehouses and PlayerModels)
      const storageKey = `${locationId}-${storage.StorageType}`
      if (processedStorages.has(storageKey)) {
        return
      }
      processedStorages.add(storageKey)

      // Check if location is excluded (match by NaturalId or Name, case-insensitive)
      if (
        excludedLocations.has(locationId.toLowerCase()) ||
        excludedLocations.has(locationName.toLowerCase())
      ) {
        if (!skippedExcluded.has(locationId)) {
          skippedExcluded.add(locationId)
          log.debug({ locationId, locationName }, 'Skipping excluded location')
        }
        const validItems = storage.Items.filter(i => i.MaterialTicker && i.Units > 0)
        result.skippedExcludedLocations += validItems.length
        return
      }

      // Validate location exists
      if (!locationIds.has(locationId)) {
        if (!unknownLocations.has(locationId)) {
          unknownLocations.add(locationId)
          log.warn({ locationId, locationName }, 'Unknown location')
        }
        // Count skipped items
        const validItems = storage.Items.filter(i => i.MaterialTicker && i.Units > 0)
        result.skippedUnknownLocations += validItems.length
        return
      }

      // Track timestamp for finding most recent
      if (storage.LastUpdated) {
        timestamps.push(new Date(storage.LastUpdated))
      }

      // Create storage record
      let storageRecord: { id: number }
      try {
        const [inserted] = await db
          .insert(fioUserStorage)
          .values({
            userId,
            storageId: `grouphub-${locationId}-${storage.StorageType}`,
            locationId,
            type: storage.StorageType,
            fioUploadedAt: storage.LastUpdated ? new Date(storage.LastUpdated) : null,
            lastSyncedAt: now,
          })
          .returning({ id: fioUserStorage.id })

        storageRecord = inserted
        result.storageLocations++
      } catch (error) {
        const errorMsg = `Failed to insert storage at ${locationId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        result.errors.push(errorMsg)
        log.error({ locationId, err: error }, 'Failed to insert storage')
        return
      }

      // Insert inventory items
      for (const item of storage.Items) {
        // Skip null/empty items
        if (!item.MaterialTicker || item.Units <= 0) {
          continue
        }

        // Validate commodity exists
        if (!commodityTickers.has(item.MaterialTicker)) {
          if (!unknownCommodities.has(item.MaterialTicker)) {
            unknownCommodities.add(item.MaterialTicker)
            log.warn({ ticker: item.MaterialTicker }, 'Unknown commodity')
          }
          result.skippedUnknownCommodities++
          continue
        }

        try {
          await db.insert(fioInventory).values({
            userStorageId: storageRecord.id,
            commodityTicker: item.MaterialTicker,
            quantity: item.Units,
          })
          result.inserted++
        } catch (error) {
          const errorMsg = `Failed to insert ${item.MaterialTicker} at ${locationId}: ${error instanceof Error ? error.message : 'Unknown error'}`
          result.errors.push(errorMsg)
          log.error(
            { ticker: item.MaterialTicker, locationId, err: error },
            'Failed to insert inventory item'
          )
        }
      }
    }

    // Process planet bases from PlayerModels
    const playerModel = groupHubData.PlayerModels?.find(
      p => p.UserName.toLowerCase() === fioUsername.toLowerCase()
    )

    if (playerModel?.Locations) {
      log.info({ count: playerModel.Locations.length }, 'Processing planet locations')

      for (const location of playerModel.Locations) {
        // Process base storage (STORE)
        await processStorage(
          location.LocationIdentifier,
          location.LocationName,
          location.BaseStorage
        )

        // Process warehouse storage (WAREHOUSE_STORE) at planets
        await processStorage(
          location.LocationIdentifier,
          location.LocationName,
          location.WarehouseStorage
        )
      }
    }

    // Process CX station warehouses
    if (groupHubData.CXWarehouses) {
      log.info({ count: groupHubData.CXWarehouses.length }, 'Processing CX warehouse locations')

      for (const cxWarehouse of groupHubData.CXWarehouses) {
        // Find this user's warehouse at this station
        const playerWarehouse = cxWarehouse.PlayerCXWarehouses?.find(
          pw => pw.PlayerName.toLowerCase() === fioUsername.toLowerCase()
        )

        if (playerWarehouse) {
          // Convert to FioGroupHubStorage format for processStorage
          const storage: FioGroupHubStorage = {
            PlayerName: playerWarehouse.PlayerName,
            StorageType: playerWarehouse.StorageType,
            Items: playerWarehouse.Items,
            LastUpdated: '', // CX warehouses don't have LastUpdated in current response
          }

          await processStorage(
            cxWarehouse.WarehouseLocationNaturalId,
            cxWarehouse.WarehouseLocationName,
            storage
          )
        }
      }
    }

    // Find most recent timestamp
    if (timestamps.length > 0) {
      const mostRecent = new Date(Math.max(...timestamps.map(t => t.getTime())))
      result.fioLastSync = mostRecent.toISOString()
    }

    result.success = result.errors.length === 0
    log.info(
      { userId, storageLocations: result.storageLocations, inventoryEntries: result.inserted },
      'Synced user inventory'
    )

    if (result.skippedExcludedLocations > 0) {
      log.info(
        { skippedItems: result.skippedExcludedLocations, excludedLocations: skippedExcluded.size },
        'Skipped excluded locations'
      )
    }
    if (result.skippedUnknownLocations > 0) {
      log.warn(
        { skippedItems: result.skippedUnknownLocations, unknownLocations: unknownLocations.size },
        'Skipped unknown locations'
      )
    }
    if (result.skippedUnknownCommodities > 0) {
      log.warn(
        {
          skippedItems: result.skippedUnknownCommodities,
          unknownCommodities: unknownCommodities.size,
        },
        'Skipped unknown commodities'
      )
    }
    if (result.errors.length > 0) {
      log.warn({ errorCount: result.errors.length }, 'Errors occurred during sync')
    }

    return result
  } catch (error) {
    const errorMsg = `Failed to sync inventory for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    log.error({ userId, err: error }, 'Failed to sync user inventory')
    return result
  }
}

/**
 * Get a user's synced FIO inventory with storage and location details
 */
export async function getUserFioInventory(userId: number) {
  return db
    .select({
      id: fioInventory.id,
      commodityTicker: fioInventory.commodityTicker,
      quantity: fioInventory.quantity,
      // Storage info
      storageId: fioUserStorage.storageId,
      storageType: fioUserStorage.type,
      fioUploadedAt: fioUserStorage.fioUploadedAt,
      lastSyncedAt: fioUserStorage.lastSyncedAt,
      // Location info
      locationId: fioUserStorage.locationId,
      locationName: fioLocations.name,
      locationType: fioLocations.type,
    })
    .from(fioInventory)
    .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
    .leftJoin(fioLocations, eq(fioUserStorage.locationId, fioLocations.naturalId))
    .where(eq(fioUserStorage.userId, userId))
}
