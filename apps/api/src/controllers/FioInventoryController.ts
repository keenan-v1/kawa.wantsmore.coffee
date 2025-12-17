import {
  Controller,
  Get,
  Post,
  Delete,
  Route,
  Security,
  Tags,
  Request,
  SuccessResponse,
} from 'tsoa'
import { db, fioInventory, fioUserStorage, fioCommodities, fioLocations } from '../db/index.js'
import { eq, count, min, max } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest } from '../utils/errors.js'
import { syncUserInventory } from '../services/fio/sync-user-inventory.js'
import { syncFioUserData } from '../services/fio/sync-user-data.js'
import { syncUserContracts } from '../services/fio/sync-contracts.js'
import * as userSettingsService from '../services/userSettingsService.js'

interface FioInventorySyncResult {
  success: boolean
  inserted: number
  storageLocations: number
  errors: string[]
  skippedUnknownLocations: number
  skippedUnknownCommodities: number
  skippedExcludedLocations: number
  fioLastSync: string | null
  // User data sync results
  userData: {
    success: boolean
    companyCode: string | null
    corporationCode: string | null
  }
  // Contract sync results
  contracts: {
    success: boolean
    contractsProcessed: number
    reservationsCreated: number
    skippedNoMatch: number
    skippedExternalPartner: number
  }
}

interface FioStatsResponse {
  totalItems: number
  totalQuantity: number
  uniqueCommodities: number
  storageLocations: number
  newestSyncTime: string | null
  oldestFioUploadTime: string | null
  oldestFioUploadLocation: {
    storageType: string
    locationNaturalId: string | null
  } | null
  newestFioUploadTime: string | null
}

interface FioInventoryResponse {
  id: number
  commodityTicker: string
  quantity: number
  locationId: string | null
  lastSyncedAt: string // From storage (when we last synced from FIO)
  commodityName: string
  commodityCategory: string | null
  locationName: string | null
  locationType: string | null
  // Storage info
  storageType: string
  fioUploadedAt: string | null // When FIO last got data from game
}

@Route('fio/inventory')
@Tags('FIO Inventory')
@Security('jwt')
export class FioInventoryController extends Controller {
  /**
   * Get the current user's synced FIO inventory
   */
  @Get()
  public async getInventory(
    @Request() request: { user: JwtPayload }
  ): Promise<FioInventoryResponse[]> {
    const userId = request.user.userId

    const items = await db
      .select({
        id: fioInventory.id,
        commodityTicker: fioInventory.commodityTicker,
        quantity: fioInventory.quantity,
        // Storage fields
        storageType: fioUserStorage.type,
        lastSyncedAt: fioUserStorage.lastSyncedAt,
        fioUploadedAt: fioUserStorage.fioUploadedAt,
        // Location fields (via storage)
        locationId: fioUserStorage.locationId,
        locationName: fioLocations.name,
        locationType: fioLocations.type,
        // Commodity fields
        commodityName: fioCommodities.name,
        commodityCategory: fioCommodities.categoryName,
      })
      .from(fioInventory)
      .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
      .innerJoin(fioCommodities, eq(fioInventory.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(fioUserStorage.locationId, fioLocations.naturalId))
      .where(eq(fioUserStorage.userId, userId))

    return items.map(item => ({
      id: item.id,
      commodityTicker: item.commodityTicker,
      quantity: item.quantity,
      locationId: item.locationId,
      lastSyncedAt: item.lastSyncedAt.toISOString(),
      commodityName: item.commodityName,
      commodityCategory: item.commodityCategory,
      locationName: item.locationName,
      locationType: item.locationType,
      storageType: item.storageType,
      fioUploadedAt: item.fioUploadedAt?.toISOString() ?? null,
    }))
  }

  /**
   * Sync the current user's data from FIO
   * Syncs: user profile data, inventory, and contracts
   * Requires the user to have FIO credentials configured
   */
  @Post('sync')
  @SuccessResponse('200', 'Sync completed')
  public async syncInventory(
    @Request() request: { user: JwtPayload }
  ): Promise<FioInventorySyncResult> {
    const userId = request.user.userId

    // Get user's FIO credentials from settings service
    const { fioUsername, fioApiKey } = await userSettingsService.getFioCredentials(userId)

    if (!fioUsername || !fioApiKey) {
      this.setStatus(400)
      throw BadRequest(
        'FIO credentials not configured. Please set your FIO username and API key in Settings.'
      )
    }

    // Get excluded locations from user settings service
    const excludedLocations = (await userSettingsService.getSetting(
      userId,
      'fio.excludedLocations'
    )) as string[]

    // 1. Sync user profile data first (needed for contract partner matching)
    const userDataResult = await syncFioUserData(userId, fioApiKey, fioUsername)

    // 2. Sync inventory
    const inventoryResult = await syncUserInventory(userId, fioApiKey, fioUsername, {
      excludedLocations: excludedLocations ?? [],
    })

    // 3. Sync contracts and auto-match to orders
    const contractsResult = await syncUserContracts(userId, fioApiKey)

    // Combine all errors
    const allErrors = [
      ...userDataResult.errors,
      ...inventoryResult.errors,
      ...contractsResult.errors,
    ]

    return {
      success: inventoryResult.success && userDataResult.success && contractsResult.success,
      inserted: inventoryResult.inserted,
      storageLocations: inventoryResult.storageLocations,
      errors: allErrors,
      skippedUnknownLocations: inventoryResult.skippedUnknownLocations,
      skippedUnknownCommodities: inventoryResult.skippedUnknownCommodities,
      skippedExcludedLocations: inventoryResult.skippedExcludedLocations,
      fioLastSync: inventoryResult.fioLastSync,
      userData: {
        success: userDataResult.success,
        companyCode: userDataResult.companyCode,
        corporationCode: userDataResult.corporationCode,
      },
      contracts: {
        success: contractsResult.success,
        contractsProcessed: contractsResult.contractsProcessed,
        reservationsCreated: contractsResult.reservationsCreated,
        skippedNoMatch: contractsResult.skippedNoMatch,
        skippedExternalPartner: contractsResult.skippedExternalPartner,
      },
    }
  }

  /**
   * Get the last sync time for the current user
   */
  @Get('last-sync')
  public async getLastSyncTime(
    @Request() request: { user: JwtPayload }
  ): Promise<{ lastSyncedAt: string | null; fioUploadedAt: string | null }> {
    const userId = request.user.userId

    // Get the most recent sync time from storage
    const [storage] = await db
      .select({
        lastSyncedAt: fioUserStorage.lastSyncedAt,
        fioUploadedAt: fioUserStorage.fioUploadedAt,
      })
      .from(fioUserStorage)
      .where(eq(fioUserStorage.userId, userId))
      .orderBy(fioUserStorage.lastSyncedAt)
      .limit(1)

    return {
      lastSyncedAt: storage?.lastSyncedAt?.toISOString() || null,
      fioUploadedAt: storage?.fioUploadedAt?.toISOString() || null,
    }
  }

  /**
   * Get the unique location IDs where the user has FIO inventory
   */
  @Get('locations')
  public async getStorageLocations(
    @Request() request: { user: JwtPayload }
  ): Promise<{ locationIds: string[] }> {
    const userId = request.user.userId

    const locations = await db
      .selectDistinct({ locationId: fioUserStorage.locationId })
      .from(fioUserStorage)
      .where(eq(fioUserStorage.userId, userId))

    // Filter out null locationIds and return unique list
    const locationIds = locations.map(l => l.locationId).filter((id): id is string => id !== null)

    return { locationIds }
  }

  /**
   * Get FIO inventory statistics for the current user
   */
  @Get('stats')
  public async getStats(@Request() request: { user: JwtPayload }): Promise<FioStatsResponse> {
    const userId = request.user.userId

    // Get storage statistics
    const [storageStats] = await db
      .select({
        storageCount: count(fioUserStorage.id),
        newestSync: max(fioUserStorage.lastSyncedAt),
        oldestFioUpload: min(fioUserStorage.fioUploadedAt),
        newestFioUpload: max(fioUserStorage.fioUploadedAt),
      })
      .from(fioUserStorage)
      .where(eq(fioUserStorage.userId, userId))

    // Get the oldest FIO upload location details
    const [oldestLocation] = await db
      .select({
        storageType: fioUserStorage.type,
        locationNaturalId: fioUserStorage.locationId,
        fioUploadedAt: fioUserStorage.fioUploadedAt,
      })
      .from(fioUserStorage)
      .where(eq(fioUserStorage.userId, userId))
      .orderBy(fioUserStorage.fioUploadedAt)
      .limit(1)

    // Get inventory statistics
    const inventoryStats = await db
      .select({
        totalQuantity: fioInventory.quantity,
        ticker: fioInventory.commodityTicker,
      })
      .from(fioInventory)
      .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
      .where(eq(fioUserStorage.userId, userId))

    const totalItems = inventoryStats.length
    const totalQuantity = inventoryStats.reduce((sum, item) => sum + item.totalQuantity, 0)
    const uniqueCommodities = new Set(inventoryStats.map(item => item.ticker)).size

    return {
      totalItems,
      totalQuantity,
      uniqueCommodities,
      storageLocations: storageStats?.storageCount ?? 0,
      newestSyncTime: storageStats?.newestSync?.toISOString() ?? null,
      oldestFioUploadTime: storageStats?.oldestFioUpload?.toISOString() ?? null,
      oldestFioUploadLocation: oldestLocation
        ? {
            storageType: oldestLocation.storageType,
            locationNaturalId: oldestLocation.locationNaturalId,
          }
        : null,
      newestFioUploadTime: storageStats?.newestFioUpload?.toISOString() ?? null,
    }
  }

  /**
   * Clear all FIO inventory data for the current user
   */
  @Delete()
  @SuccessResponse('200', 'Inventory cleared')
  public async clearInventory(
    @Request() request: { user: JwtPayload }
  ): Promise<{ success: boolean; deletedItems: number; deletedStorages: number }> {
    const userId = request.user.userId

    // Get storage IDs for this user
    const userStorages = await db
      .select({ id: fioUserStorage.id })
      .from(fioUserStorage)
      .where(eq(fioUserStorage.userId, userId))

    const storageIds = userStorages.map(s => s.id)

    let deletedItems = 0
    if (storageIds.length > 0) {
      // Delete inventory items first (foreign key constraint)
      for (const storageId of storageIds) {
        // Count items before deletion
        const [itemCount] = await db
          .select({ count: count(fioInventory.id) })
          .from(fioInventory)
          .where(eq(fioInventory.userStorageId, storageId))

        await db.delete(fioInventory).where(eq(fioInventory.userStorageId, storageId))
        deletedItems += itemCount?.count ?? 0
      }
    }

    // Delete storage records
    const deletedStorages = userStorages.length
    await db.delete(fioUserStorage).where(eq(fioUserStorage.userId, userId))

    return {
      success: true,
      deletedItems,
      deletedStorages,
    }
  }
}
