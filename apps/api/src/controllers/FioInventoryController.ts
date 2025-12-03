import {
  Controller,
  Get,
  Post,
  Route,
  Security,
  Tags,
  Request,
  SuccessResponse,
} from 'tsoa'
import { db, userSettings, fioInventory, fioUserStorage, fioCommodities, fioLocations } from '../db/index.js'
import { eq } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest } from '../utils/errors.js'
import { syncUserInventory } from '../services/fio/sync-user-inventory.js'

interface FioInventorySyncResult {
  success: boolean
  inserted: number
  storageLocations: number
  errors: string[]
  skippedUnknownLocations: number
  skippedUnknownCommodities: number
  fioLastSync: string | null
}

interface FioInventoryResponse {
  id: number
  commodityTicker: string
  quantity: number
  locationId: string | null
  lastSyncedAt: string
  commodityName: string
  commodityCategory: string | null
  locationName: string | null
  locationType: string | null
  // Storage info
  storageType: string
  weightLoad: number | null
  weightCapacity: number | null
  volumeLoad: number | null
  volumeCapacity: number | null
  fioTimestamp: string | null
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
        lastSyncedAt: fioInventory.lastSyncedAt,
        // Storage fields
        storageType: fioUserStorage.type,
        weightLoad: fioUserStorage.weightLoad,
        weightCapacity: fioUserStorage.weightCapacity,
        volumeLoad: fioUserStorage.volumeLoad,
        volumeCapacity: fioUserStorage.volumeCapacity,
        fioTimestamp: fioUserStorage.fioTimestamp,
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
      .where(eq(fioInventory.userId, userId))

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
      weightLoad: item.weightLoad ? parseFloat(item.weightLoad) : null,
      weightCapacity: item.weightCapacity ? parseFloat(item.weightCapacity) : null,
      volumeLoad: item.volumeLoad ? parseFloat(item.volumeLoad) : null,
      volumeCapacity: item.volumeCapacity ? parseFloat(item.volumeCapacity) : null,
      fioTimestamp: item.fioTimestamp?.toISOString() ?? null,
    }))
  }

  /**
   * Sync the current user's inventory from FIO
   * Requires the user to have FIO credentials configured
   */
  @Post('sync')
  @SuccessResponse('200', 'Sync completed')
  public async syncInventory(
    @Request() request: { user: JwtPayload }
  ): Promise<FioInventorySyncResult> {
    const userId = request.user.userId

    // Get user's FIO credentials
    const [settings] = await db
      .select({
        fioUsername: userSettings.fioUsername,
        fioApiKey: userSettings.fioApiKey,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))

    if (!settings?.fioUsername || !settings?.fioApiKey) {
      this.setStatus(400)
      throw BadRequest('FIO credentials not configured. Please set your FIO username and API key in your profile.')
    }

    // Perform sync
    const result = await syncUserInventory(userId, settings.fioApiKey, settings.fioUsername)

    return {
      success: result.success,
      inserted: result.inserted,
      storageLocations: result.storageLocations,
      errors: result.errors,
      skippedUnknownLocations: result.skippedUnknownLocations,
      skippedUnknownCommodities: result.skippedUnknownCommodities,
      fioLastSync: result.fioLastSync,
    }
  }

  /**
   * Get the last sync time for the current user
   */
  @Get('last-sync')
  public async getLastSyncTime(
    @Request() request: { user: JwtPayload }
  ): Promise<{ lastSyncedAt: string | null; fioTimestamp: string | null }> {
    const userId = request.user.userId

    // Get the most recent sync time from storage (when we synced from FIO)
    const [storage] = await db
      .select({
        lastSyncedAt: fioUserStorage.lastSyncedAt,
        fioTimestamp: fioUserStorage.fioTimestamp,
      })
      .from(fioUserStorage)
      .where(eq(fioUserStorage.userId, userId))
      .orderBy(fioUserStorage.lastSyncedAt)
      .limit(1)

    return {
      lastSyncedAt: storage?.lastSyncedAt?.toISOString() || null,
      fioTimestamp: storage?.fioTimestamp?.toISOString() || null,
    }
  }
}
