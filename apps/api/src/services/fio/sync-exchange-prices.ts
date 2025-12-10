// Sync exchange prices from FIO API to prices table
// Fetches market prices for all commodities across all FIO exchanges (CI1, NC1, IC1, AI1)

import { eq } from 'drizzle-orm'
import { db, prices, priceLists, fioCommodities } from '../../db/index.js'
import { fioClient } from './client.js'
import { parseCsvTyped } from './csv-parser.js'
import { createLogger } from '../../utils/logger.js'
import type { Currency } from '@kawakawa/types'

const log = createLogger({ service: 'fio-sync', entity: 'exchange-prices' })

/**
 * Price fields available from FIO API
 */
export type FioPriceField = 'MMBuy' | 'MMSell' | 'PriceAverage' | 'Ask' | 'Bid'

/**
 * Raw price data from FIO /csv/prices endpoint
 * The API returns a PIVOT format where each exchange has its own columns:
 * Ticker, MMBuy, MMSell, AI1-Average, AI1-AskPrice, AI1-BidPrice, CI1-Average, CI1-AskPrice, ...
 */
interface FioCsvPriceRow {
  Ticker: string
  MMBuy: number | null
  MMSell: number | null
  // Dynamic columns for each exchange: {EX}-Average, {EX}-AskPrice, {EX}-BidPrice, etc.
  [key: string]: string | number | null | undefined
}

/**
 * Result of syncing a single exchange
 */
export interface FioExchangeSyncResult {
  priceListCode: string
  locationId: string | null
  currency: Currency
  pricesUpdated: number
  pricesSkipped: number // Unknown tickers or null prices
  syncedAt: Date
  // Backwards compatibility
  exchangeCode: string
}

/**
 * Result of syncing all FIO exchange prices
 */
export interface FioExchangesSyncResult {
  success: boolean
  exchanges: FioExchangeSyncResult[]
  totalUpdated: number
  totalSkipped: number
  errors: string[]
}

/**
 * FIO price list info from database
 */
interface FioPriceListInfo {
  code: string
  defaultLocationId: string | null
  currency: Currency
}

/**
 * Get all FIO price lists from database (type='fio')
 */
async function getFioPriceLists(): Promise<FioPriceListInfo[]> {
  const results = await db
    .select({
      code: priceLists.code,
      defaultLocationId: priceLists.defaultLocationId,
      currency: priceLists.currency,
    })
    .from(priceLists)
    .where(eq(priceLists.type, 'fio'))

  return results as FioPriceListInfo[]
}

/**
 * Get all valid commodity tickers from database
 */
async function getValidTickers(): Promise<Set<string>> {
  const commodities = await db.select({ ticker: fioCommodities.ticker }).from(fioCommodities)
  return new Set(commodities.map(c => c.ticker))
}

/**
 * Get price from FIO price data for a specific exchange using the configured price field
 * The FIO API uses pivot format with columns like: CI1-Average, CI1-AskPrice, CI1-BidPrice
 */
function getPriceValue(
  priceData: FioCsvPriceRow,
  exchangeCode: string,
  priceField: FioPriceField
): number | null {
  // Map price fields to FIO column suffixes
  const fieldToColumn: Record<FioPriceField, string> = {
    MMBuy: 'MMBuy', // Global column, not exchange-specific
    MMSell: 'MMSell', // Global column, not exchange-specific
    PriceAverage: `${exchangeCode}-Average`,
    Ask: `${exchangeCode}-AskPrice`,
    Bid: `${exchangeCode}-BidPrice`,
  }

  const columnName = fieldToColumn[priceField]

  // For MMBuy/MMSell, use global columns
  if (priceField === 'MMBuy' || priceField === 'MMSell') {
    const value = priceData[columnName]
    return typeof value === 'number' ? value : null
  }

  // For exchange-specific fields, use the prefixed column
  const value = priceData[columnName]
  return typeof value === 'number' ? value : null
}

/**
 * Sync exchange prices from FIO API
 *
 * @param priceListCode - Optional: specific price list to sync (CI1, NC1, etc.). If null, syncs all FIO price lists.
 * @param priceField - Which FIO price field to use. Defaults to 'PriceAverage'.
 */
export async function syncFioExchangePrices(
  priceListCode?: string,
  priceField: FioPriceField = 'PriceAverage'
): Promise<FioExchangesSyncResult> {
  const result: FioExchangesSyncResult = {
    success: false,
    exchanges: [],
    totalUpdated: 0,
    totalSkipped: 0,
    errors: [],
  }

  try {
    // Get FIO price lists from database
    let fioPriceLists = await getFioPriceLists()

    // Filter to specific price list if provided
    if (priceListCode) {
      fioPriceLists = fioPriceLists.filter(pl => pl.code === priceListCode)
      if (fioPriceLists.length === 0) {
        result.errors.push(`Price list '${priceListCode}' not found or is not a FIO price list`)
        return result
      }
    }

    log.info({ priceLists: fioPriceLists.map(e => e.code), priceField }, 'Starting FIO price sync')

    // Get valid tickers for validation
    const validTickers = await getValidTickers()
    if (validTickers.size === 0) {
      result.errors.push('No commodities found in database. Run fio:sync:commodities first.')
      return result
    }

    // Fetch all prices from FIO API
    log.info('Fetching prices from FIO API')
    const csvData = await fioClient.getPrices(true)
    const allPrices = parseCsvTyped<FioCsvPriceRow>(csvData)
    log.info({ count: allPrices.length }, 'Parsed price records from FIO')

    // Process each price list - the FIO API returns a pivot format
    // where each row has one ticker with columns for each exchange: CI1-Average, NC1-Average, etc.
    const syncedAt = new Date()
    for (const priceList of fioPriceLists) {
      const exchangeResult: FioExchangeSyncResult = {
        priceListCode: priceList.code,
        locationId: priceList.defaultLocationId,
        currency: priceList.currency,
        pricesUpdated: 0,
        pricesSkipped: 0,
        syncedAt,
        exchangeCode: priceList.code,
      }

      // If price list has no default location (shouldn't happen for FIO price lists), skip
      if (!priceList.defaultLocationId) {
        result.errors.push(`Price list ${priceList.code} has no default location configured`)
        continue
      }

      log.info(
        { priceList: priceList.code, tickerCount: allPrices.length },
        'Processing exchange prices'
      )

      // Iterate through all commodity rows and extract this exchange's prices
      for (const priceData of allPrices) {
        // Validate ticker exists
        if (!priceData.Ticker || !validTickers.has(priceData.Ticker)) {
          exchangeResult.pricesSkipped++
          continue
        }

        // Get price using configured field for this specific exchange
        const price = getPriceValue(priceData, priceList.code, priceField)

        // Skip if price is null or 0 (no market data for this exchange)
        if (price === null || price === 0) {
          exchangeResult.pricesSkipped++
          continue
        }

        try {
          // Upsert price into prices table
          await db
            .insert(prices)
            .values({
              priceListCode: priceList.code,
              commodityTicker: priceData.Ticker,
              locationId: priceList.defaultLocationId,
              price: price.toFixed(2),
              source: 'fio_exchange',
              sourceReference: `FIO ${priceField} - ${syncedAt.toISOString()}`,
            })
            .onConflictDoUpdate({
              target: [prices.priceListCode, prices.commodityTicker, prices.locationId],
              set: {
                price: price.toFixed(2),
                source: 'fio_exchange',
                sourceReference: `FIO ${priceField} - ${syncedAt.toISOString()}`,
                updatedAt: syncedAt,
              },
            })

          exchangeResult.pricesUpdated++
        } catch (error) {
          const errorMsg = `Failed to upsert price for ${priceData.Ticker} on ${priceList.code}: ${error instanceof Error ? error.message : 'Unknown error'}`
          result.errors.push(errorMsg)
          log.error(
            { ticker: priceData.Ticker, priceList: priceList.code, err: error },
            'Failed to upsert price'
          )
        }
      }

      result.exchanges.push(exchangeResult)
      result.totalUpdated += exchangeResult.pricesUpdated
      result.totalSkipped += exchangeResult.pricesSkipped

      log.info(
        {
          priceList: priceList.code,
          updated: exchangeResult.pricesUpdated,
          skipped: exchangeResult.pricesSkipped,
        },
        'Completed price list sync'
      )
    }

    result.success = result.errors.length === 0
    log.info(
      { totalUpdated: result.totalUpdated, totalSkipped: result.totalSkipped },
      'FIO price sync complete'
    )

    return result
  } catch (error) {
    const errorMsg = `Failed to sync FIO prices: ${error instanceof Error ? error.message : 'Unknown error'}`
    result.errors.push(errorMsg)
    log.error({ err: error }, 'Failed to sync FIO prices')
    return result
  }
}

/**
 * Get the last sync time for a specific price list
 */
export async function getLastSyncTime(priceListCode: string): Promise<Date | null> {
  const result = await db
    .select({ updatedAt: prices.updatedAt })
    .from(prices)
    .where(eq(prices.priceListCode, priceListCode))
    .orderBy(prices.updatedAt)
    .limit(1)

  return result.length > 0 ? result[0].updatedAt : null
}

/**
 * Get sync status for all FIO price lists
 */
export async function getFioExchangeSyncStatus(): Promise<
  {
    priceListCode: string
    locationId: string | null
    lastSyncedAt: Date | null
    priceCount: number
    // Backwards compatibility
    exchangeCode: string
  }[]
> {
  const fioPriceLists = await getFioPriceLists()
  const status = []

  for (const priceList of fioPriceLists) {
    const priceRecords = await db
      .select({ id: prices.id, updatedAt: prices.updatedAt })
      .from(prices)
      .where(eq(prices.priceListCode, priceList.code))

    // Get the most recent update time
    let lastSyncedAt: Date | null = null
    for (const p of priceRecords) {
      if (p.updatedAt && (!lastSyncedAt || p.updatedAt > lastSyncedAt)) {
        lastSyncedAt = p.updatedAt
      }
    }

    status.push({
      priceListCode: priceList.code,
      locationId: priceList.defaultLocationId,
      lastSyncedAt,
      priceCount: priceRecords.length,
      exchangeCode: priceList.code,
    })
  }

  return status
}
