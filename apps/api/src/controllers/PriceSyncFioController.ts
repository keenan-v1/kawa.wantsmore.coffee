import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Query,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import {
  syncFioExchangePrices,
  getFioExchangeSyncStatus,
  type FioPriceField,
  type FioExchangesSyncResult,
} from '../services/fio/index.js'
import type { Currency } from '@kawakawa/types'

/**
 * Response type for exchange sync status
 */
interface ExchangeSyncStatus {
  exchangeCode: string
  locationId: string | null
  lastSyncedAt: Date | null
  priceCount: number
}

/**
 * Request body for triggering a price sync
 */
interface SyncPricesRequest {
  /**
   * Which FIO price field to use for syncing
   * @default "PriceAverage"
   */
  priceField?: FioPriceField
}

/**
 * Response type for a single exchange sync result
 */
interface ExchangeSyncResultResponse {
  exchangeCode: string
  locationId: string | null
  currency: Currency
  pricesUpdated: number
  pricesSkipped: number
  syncedAt: Date
}

/**
 * Response type for the sync operation
 */
interface SyncPricesResponse {
  success: boolean
  exchanges: ExchangeSyncResultResponse[]
  totalUpdated: number
  totalSkipped: number
  errors: string[]
}

@Route('prices/sync/fio')
@Tags('Pricing')
export class PriceSyncFioController extends Controller {
  /**
   * Get sync status for all FIO exchanges
   * Returns last sync time and price count for each exchange
   */
  @Get('status')
  public async getSyncStatus(): Promise<ExchangeSyncStatus[]> {
    return getFioExchangeSyncStatus()
  }

  /**
   * Sync prices from all FIO exchanges
   * Fetches current market prices from FIO API and updates the price list
   *
   * @param body Optional request body specifying which price field to use
   */
  @Post()
  @Security('jwt', ['prices.sync_fio'])
  @SuccessResponse('200', 'Sync completed')
  public async syncAllExchanges(@Body() body?: SyncPricesRequest): Promise<SyncPricesResponse> {
    const priceField = body?.priceField ?? 'PriceAverage'
    const result = await syncFioExchangePrices(undefined, priceField)
    return this.formatSyncResult(result)
  }

  /**
   * Sync prices from a specific FIO exchange
   *
   * @param exchangeCode The exchange code to sync (e.g., 'CI1', 'NC1')
   * @param priceField Which FIO price field to use (default: PriceAverage)
   */
  @Post('{exchangeCode}')
  @Security('jwt', ['prices.sync_fio'])
  @SuccessResponse('200', 'Sync completed')
  public async syncExchange(
    @Path() exchangeCode: string,
    @Query() priceField?: FioPriceField
  ): Promise<SyncPricesResponse> {
    const result = await syncFioExchangePrices(
      exchangeCode.toUpperCase(),
      priceField ?? 'PriceAverage'
    )
    return this.formatSyncResult(result)
  }

  /**
   * Format the sync result for the API response
   */
  private formatSyncResult(result: FioExchangesSyncResult): SyncPricesResponse {
    return {
      success: result.success,
      exchanges: result.exchanges.map(ex => ({
        exchangeCode: ex.exchangeCode,
        locationId: ex.locationId,
        currency: ex.currency,
        pricesUpdated: ex.pricesUpdated,
        pricesSkipped: ex.pricesSkipped,
        syncedAt: ex.syncedAt,
      })),
      totalUpdated: result.totalUpdated,
      totalSkipped: result.totalSkipped,
      errors: result.errors,
    }
  }
}
