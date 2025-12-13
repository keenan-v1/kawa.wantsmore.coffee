import type { Currency } from '@kawakawa/types'
import {
  db,
  prices,
  priceLists,
  priceAdjustments,
  fioCommodities,
  fioLocations,
} from '@kawakawa/db'
import { eq, and, or, isNull, lte, gt } from 'drizzle-orm'

export type PriceSource = 'manual' | 'csv_import' | 'google_sheets' | 'fio_exchange'
export type AdjustmentType = 'percentage' | 'fixed'

export interface AppliedAdjustment {
  id: number
  description: string | null
  type: AdjustmentType
  value: number
  appliedAmount: number // Actual change in price units
}

export interface EffectivePrice {
  priceListCode: string
  commodityTicker: string
  commodityName: string | null
  locationId: string
  locationName: string | null
  currency: Currency
  basePrice: number
  source: PriceSource
  sourceReference: string | null
  adjustments: AppliedAdjustment[]
  finalPrice: number
  // Backwards compatibility
  exchangeCode: string
  // Fallback information
  isFallback?: boolean // True if price came from default location
  requestedLocationId?: string // Original requested location (when isFallback is true)
}

/**
 * Calculate the effective price for a commodity at a specific price list and location
 * Applies all matching adjustments in priority order
 */
export async function calculateEffectivePrice(
  exchange: string,
  ticker: string,
  locationId: string,
  currency: Currency
): Promise<EffectivePrice | null> {
  const priceListCode = exchange.toUpperCase()
  const commodityTicker = ticker.toUpperCase()
  const location = locationId // Location IDs are case-sensitive (e.g., KW-020c)

  // Get the base price from prices table, joined with priceLists for currency
  const basePriceResult = await db
    .select({
      priceListCode: prices.priceListCode,
      commodityTicker: prices.commodityTicker,
      commodityName: fioCommodities.name,
      locationId: prices.locationId,
      locationName: fioLocations.name,
      price: prices.price,
      currency: priceLists.currency,
      source: prices.source,
      sourceReference: prices.sourceReference,
    })
    .from(prices)
    .innerJoin(priceLists, eq(prices.priceListCode, priceLists.code))
    .leftJoin(fioCommodities, eq(prices.commodityTicker, fioCommodities.ticker))
    .leftJoin(fioLocations, eq(prices.locationId, fioLocations.naturalId))
    .where(
      and(
        eq(prices.priceListCode, priceListCode),
        eq(prices.commodityTicker, commodityTicker),
        eq(prices.locationId, location),
        eq(priceLists.currency, currency)
      )
    )
    .limit(1)

  if (basePriceResult.length === 0) {
    return null
  }

  const baseRecord = basePriceResult[0]
  const basePrice = parseFloat(baseRecord.price)
  const now = new Date()

  // Get all matching adjustments
  const adjustmentResults = await db
    .select({
      id: priceAdjustments.id,
      priceListCode: priceAdjustments.priceListCode,
      commodityTicker: priceAdjustments.commodityTicker,
      locationId: priceAdjustments.locationId,
      adjustmentType: priceAdjustments.adjustmentType,
      adjustmentValue: priceAdjustments.adjustmentValue,
      priority: priceAdjustments.priority,
      description: priceAdjustments.description,
    })
    .from(priceAdjustments)
    .where(
      and(
        // Match price list (NULL = wildcard)
        or(
          isNull(priceAdjustments.priceListCode),
          eq(priceAdjustments.priceListCode, priceListCode)
        ),
        // Match commodity (NULL = wildcard)
        or(
          isNull(priceAdjustments.commodityTicker),
          eq(priceAdjustments.commodityTicker, commodityTicker)
        ),
        // Match location (NULL = wildcard)
        or(isNull(priceAdjustments.locationId), eq(priceAdjustments.locationId, location)),
        // Must be active
        eq(priceAdjustments.isActive, true),
        // Must be in effective date range
        or(isNull(priceAdjustments.effectiveFrom), lte(priceAdjustments.effectiveFrom, now)),
        or(isNull(priceAdjustments.effectiveUntil), gt(priceAdjustments.effectiveUntil, now))
      )
    )
    .orderBy(priceAdjustments.priority, priceAdjustments.id)

  // Apply adjustments in priority order
  let currentPrice = basePrice
  const appliedAdjustments: AppliedAdjustment[] = []

  for (const adj of adjustmentResults) {
    const adjustmentValue = parseFloat(adj.adjustmentValue)
    let appliedAmount: number

    if (adj.adjustmentType === 'percentage') {
      // Percentage adjustment: price = price * (1 + value/100)
      appliedAmount = currentPrice * (adjustmentValue / 100)
      currentPrice = currentPrice + appliedAmount
    } else {
      // Fixed adjustment: price = price + value
      appliedAmount = adjustmentValue
      currentPrice = currentPrice + appliedAmount
    }

    appliedAdjustments.push({
      id: adj.id,
      description: adj.description,
      type: adj.adjustmentType,
      value: adjustmentValue,
      appliedAmount: Math.round(appliedAmount * 100) / 100, // Round to 2 decimal places
    })
  }

  // Round final price to 2 decimal places
  const finalPrice = Math.round(currentPrice * 100) / 100

  return {
    priceListCode: baseRecord.priceListCode,
    commodityTicker: baseRecord.commodityTicker,
    commodityName: baseRecord.commodityName,
    locationId: baseRecord.locationId,
    locationName: baseRecord.locationName,
    currency: baseRecord.currency,
    basePrice,
    source: baseRecord.source,
    sourceReference: baseRecord.sourceReference,
    adjustments: appliedAdjustments,
    finalPrice,
    // Backwards compatibility
    exchangeCode: baseRecord.priceListCode,
  }
}

/**
 * Calculate effective price with fallback to the price list's default location
 * This is the recommended function to use when you want automatic fallback behavior
 *
 * Note: The currency parameter is ignored - we use the price list's currency instead.
 * This ensures dynamic pricing always works regardless of what currency was stored on the order.
 */
export async function calculateEffectivePriceWithFallback(
  priceListCode: string,
  ticker: string,
  locationId: string,
  _currency: Currency // Ignored - we use the price list's currency
): Promise<EffectivePrice | null> {
  // First get the price list's currency and default location
  const priceListResult = await db
    .select({
      currency: priceLists.currency,
      defaultLocationId: priceLists.defaultLocationId,
    })
    .from(priceLists)
    .where(eq(priceLists.code, priceListCode.toUpperCase()))
    .limit(1)

  if (priceListResult.length === 0) {
    return null
  }

  const priceListCurrency = priceListResult[0].currency
  const defaultLocationId = priceListResult[0].defaultLocationId

  // First try the requested location with the price list's currency
  let result = await calculateEffectivePrice(priceListCode, ticker, locationId, priceListCurrency)

  if (result !== null) {
    return result
  }

  // If no default location or same as requested, no fallback possible
  if (!defaultLocationId || defaultLocationId === locationId) {
    return null
  }

  // Try the default location with the price list's currency
  result = await calculateEffectivePrice(
    priceListCode,
    ticker,
    defaultLocationId,
    priceListCurrency
  )

  // Mark result as fallback with the original requested location
  if (result) {
    return {
      ...result,
      isFallback: true,
      requestedLocationId: locationId,
    }
  }

  return null
}

/**
 * Get the display price for an order.
 * Handles both fixed and dynamic pricing modes.
 *
 * @param order - Order with price data
 * @returns Display price and currency, or null if price can't be determined
 */
export async function getOrderDisplayPrice(order: {
  price: string | number
  currency: Currency
  priceListCode: string | null
  commodityTicker: string
  locationId: string
}): Promise<{ price: number; currency: Currency } | null> {
  const storedPrice = typeof order.price === 'string' ? parseFloat(order.price) : order.price

  // Dynamic pricing: priceListCode is set and stored price is 0
  if (order.priceListCode && storedPrice === 0) {
    const effectivePrice = await calculateEffectivePriceWithFallback(
      order.priceListCode,
      order.commodityTicker,
      order.locationId,
      order.currency
    )

    if (effectivePrice) {
      return {
        price: effectivePrice.finalPrice,
        currency: effectivePrice.currency,
      }
    }

    // Dynamic pricing failed - no price available
    return null
  }

  // Fixed pricing: use stored price
  return {
    price: storedPrice,
    currency: order.currency,
  }
}
