/**
 * FIO User Inventory Sync Service
 * Syncs user inventory from FIO API to database using GroupHub endpoint
 */

import { eq } from 'drizzle-orm'
import { db, fioInventory, fioUserStorage, fioLocations, fioCommodities } from '@kawakawa/db'
import { FioClient } from './client.js'
import type {
  FioGroupHubResponse,
  FioGroupHubStorage,
  FioSyncResult,
  FioSyncOptions,
} from './types.js'

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
  options: FioSyncOptions = {}
): Promise<FioSyncResult> {
  const result: FioSyncResult = {
    success: false,
    inserted: 0,
    storageLocations: 0,
    errors: [],
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
    // Track processed storages to avoid duplicates
    const processedStorages = new Set<string>()

    // Track excluded locations
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

      // Skip if already processed
      const storageKey = `${locationId}-${storage.StorageType}`
      if (processedStorages.has(storageKey)) {
        return
      }
      processedStorages.add(storageKey)

      // Check if location is excluded
      if (
        excludedLocations.has(locationId.toLowerCase()) ||
        excludedLocations.has(locationName.toLowerCase())
      ) {
        if (!skippedExcluded.has(locationId)) {
          skippedExcluded.add(locationId)
        }
        const validItems = storage.Items.filter(i => i.MaterialTicker && i.Units > 0)
        result.skippedExcludedLocations += validItems.length
        return
      }

      // Validate location exists
      if (!locationIds.has(locationId)) {
        if (!unknownLocations.has(locationId)) {
          unknownLocations.add(locationId)
        }
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
        }
      }
    }

    // Process planet bases from PlayerModels
    const playerModel = groupHubData.PlayerModels?.find(
      p => p.UserName.toLowerCase() === fioUsername.toLowerCase()
    )

    if (playerModel?.Locations) {
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
      for (const cxWarehouse of groupHubData.CXWarehouses) {
        // Find this user's warehouse at this station
        const playerWarehouse = cxWarehouse.PlayerCXWarehouses?.find(
          pw => pw.PlayerName.toLowerCase() === fioUsername.toLowerCase()
        )

        if (playerWarehouse) {
          // Convert to FioGroupHubStorage format
          const storage: FioGroupHubStorage = {
            PlayerName: playerWarehouse.PlayerName,
            StorageType: playerWarehouse.StorageType,
            Items: playerWarehouse.Items,
            LastUpdated: '', // CX warehouses don't have LastUpdated
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

    return result
  } catch (error) {
    const errorMsg = `Failed to sync inventory: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    return result
  }
}
