// Sync exchange prices from FIO API to price_lists table
// Fetches market prices for all commodities across all FIO exchanges (CI1, NC1, IC1, AI1)

import { eq } from 'drizzle-orm'
import { db, priceLists, fioExchanges, fioCommodities } from '../../db/index.js'
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
 */
interface FioCsvPrice {
  Ticker: string
  ExchangeCode: string
  MMBuy: number | null
  MMSell: number | null
  PriceAverage: number | null
  Ask: number | null
  Bid: number | null
}

/**
 * Result of syncing a single exchange
 */
export interface FioExchangeSyncResult {
  exchangeCode: string
  locationId: string | null
  currency: Currency
  pricesUpdated: number
  pricesSkipped: number // Unknown tickers or null prices
  syncedAt: Date
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
 * FIO exchange info from database
 */
interface FioExchangeInfo {
  code: string
  locationId: string | null
  currency: Currency
}

/**
 * Get all FIO exchanges from database (excludes KAWA which is internal)
 */
async function getFioExchanges(): Promise<FioExchangeInfo[]> {
  const exchanges = await db
    .select({
      code: fioExchanges.code,
      locationId: fioExchanges.locationId,
      currency: fioExchanges.currency,
    })
    .from(fioExchanges)

  // Filter out KAWA - it's our internal exchange, not a FIO exchange
  return exchanges.filter(ex => ex.code !== 'KAWA') as FioExchangeInfo[]
}

/**
 * Get all valid commodity tickers from database
 */
async function getValidTickers(): Promise<Set<string>> {
  const commodities = await db.select({ ticker: fioCommodities.ticker }).from(fioCommodities)
  return new Set(commodities.map(c => c.ticker))
}

/**
 * Get price from FIO price data using the configured price field
 */
function getPriceValue(priceData: FioCsvPrice, priceField: FioPriceField): number | null {
  switch (priceField) {
    case 'MMBuy':
      return priceData.MMBuy
    case 'MMSell':
      return priceData.MMSell
    case 'PriceAverage':
      return priceData.PriceAverage
    case 'Ask':
      return priceData.Ask
    case 'Bid':
      return priceData.Bid
    default:
      return priceData.PriceAverage
  }
}

/**
 * Sync exchange prices from FIO API
 *
 * @param exchangeCode - Optional: specific exchange to sync (CI1, NC1, etc.). If null, syncs all FIO exchanges.
 * @param priceField - Which FIO price field to use. Defaults to 'PriceAverage'.
 */
export async function syncFioExchangePrices(
  exchangeCode?: string,
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
    // Get FIO exchanges from database
    let exchanges = await getFioExchanges()

    // Filter to specific exchange if provided
    if (exchangeCode) {
      exchanges = exchanges.filter(ex => ex.code === exchangeCode)
      if (exchanges.length === 0) {
        result.errors.push(`Exchange code '${exchangeCode}' not found or is not a FIO exchange`)
        return result
      }
    }

    log.info({ exchanges: exchanges.map(e => e.code), priceField }, 'Starting FIO price sync')

    // Get valid tickers for validation
    const validTickers = await getValidTickers()
    if (validTickers.size === 0) {
      result.errors.push('No commodities found in database. Run fio:sync:commodities first.')
      return result
    }

    // Fetch all prices from FIO API
    log.info('Fetching prices from FIO API')
    const csvData = await fioClient.getPrices(true)
    const allPrices = parseCsvTyped<FioCsvPrice>(csvData)
    log.info({ count: allPrices.length }, 'Parsed price records from FIO')

    // Group prices by exchange code
    const pricesByExchange = new Map<string, FioCsvPrice[]>()
    for (const price of allPrices) {
      const existing = pricesByExchange.get(price.ExchangeCode) || []
      existing.push(price)
      pricesByExchange.set(price.ExchangeCode, existing)
    }

    // Process each exchange
    const syncedAt = new Date()
    for (const exchange of exchanges) {
      const exchangePrices = pricesByExchange.get(exchange.code) || []
      const exchangeResult: FioExchangeSyncResult = {
        exchangeCode: exchange.code,
        locationId: exchange.locationId,
        currency: exchange.currency,
        pricesUpdated: 0,
        pricesSkipped: 0,
        syncedAt,
      }

      // If exchange has no location (shouldn't happen for FIO exchanges), skip
      if (!exchange.locationId) {
        result.errors.push(`Exchange ${exchange.code} has no location configured`)
        continue
      }

      log.info(
        { exchange: exchange.code, priceCount: exchangePrices.length },
        'Processing exchange prices'
      )

      for (const priceData of exchangePrices) {
        // Validate ticker exists
        if (!validTickers.has(priceData.Ticker)) {
          exchangeResult.pricesSkipped++
          continue
        }

        // Get price using configured field
        const price = getPriceValue(priceData, priceField)

        // Skip if price is null or 0 (no market data)
        if (price === null || price === 0) {
          exchangeResult.pricesSkipped++
          continue
        }

        try {
          // Upsert price into price_lists
          await db
            .insert(priceLists)
            .values({
              exchangeCode: exchange.code,
              commodityTicker: priceData.Ticker,
              locationId: exchange.locationId,
              price: price.toFixed(2),
              currency: exchange.currency,
              source: 'fio_exchange',
              sourceReference: `FIO ${priceField} - ${syncedAt.toISOString()}`,
            })
            .onConflictDoUpdate({
              target: [
                priceLists.exchangeCode,
                priceLists.commodityTicker,
                priceLists.locationId,
                priceLists.currency,
              ],
              set: {
                price: price.toFixed(2),
                source: 'fio_exchange',
                sourceReference: `FIO ${priceField} - ${syncedAt.toISOString()}`,
                updatedAt: syncedAt,
              },
            })

          exchangeResult.pricesUpdated++
        } catch (error) {
          const errorMsg = `Failed to upsert price for ${priceData.Ticker} on ${exchange.code}: ${error instanceof Error ? error.message : 'Unknown error'}`
          result.errors.push(errorMsg)
          log.error(
            { ticker: priceData.Ticker, exchange: exchange.code, err: error },
            'Failed to upsert price'
          )
        }
      }

      result.exchanges.push(exchangeResult)
      result.totalUpdated += exchangeResult.pricesUpdated
      result.totalSkipped += exchangeResult.pricesSkipped

      log.info(
        {
          exchange: exchange.code,
          updated: exchangeResult.pricesUpdated,
          skipped: exchangeResult.pricesSkipped,
        },
        'Completed exchange sync'
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
 * Get the last sync time for a specific exchange
 */
export async function getLastSyncTime(exchangeCode: string): Promise<Date | null> {
  const result = await db
    .select({ updatedAt: priceLists.updatedAt })
    .from(priceLists)
    .where(eq(priceLists.exchangeCode, exchangeCode))
    .orderBy(priceLists.updatedAt)
    .limit(1)

  return result.length > 0 ? result[0].updatedAt : null
}

/**
 * Get sync status for all FIO exchanges
 */
export async function getFioExchangeSyncStatus(): Promise<
  {
    exchangeCode: string
    locationId: string | null
    lastSyncedAt: Date | null
    priceCount: number
  }[]
> {
  const exchanges = await getFioExchanges()
  const status = []

  for (const exchange of exchanges) {
    const prices = await db
      .select({ count: priceLists.id, updatedAt: priceLists.updatedAt })
      .from(priceLists)
      .where(eq(priceLists.exchangeCode, exchange.code))

    // Get the most recent update time
    let lastSyncedAt: Date | null = null
    for (const p of prices) {
      if (p.updatedAt && (!lastSyncedAt || p.updatedAt > lastSyncedAt)) {
        lastSyncedAt = p.updatedAt
      }
    }

    status.push({
      exchangeCode: exchange.code,
      locationId: exchange.locationId,
      lastSyncedAt,
      priceCount: prices.length,
    })
  }

  return status
}
