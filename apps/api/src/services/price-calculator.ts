import type { Currency } from '@kawakawa/types'
import { db, priceLists, priceAdjustments, fioCommodities, fioLocations } from '../db/index.js'
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
  exchangeCode: string
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
}

/**
 * Calculate the effective price for a commodity at a specific exchange and location
 * Applies all matching adjustments in priority order
 */
export async function calculateEffectivePrice(
  exchange: string,
  ticker: string,
  locationId: string,
  currency: Currency
): Promise<EffectivePrice | null> {
  const exchangeCode = exchange.toUpperCase()
  const commodityTicker = ticker.toUpperCase()
  const location = locationId.toUpperCase()

  // Get the base price
  const basePriceResult = await db
    .select({
      exchangeCode: priceLists.exchangeCode,
      commodityTicker: priceLists.commodityTicker,
      commodityName: fioCommodities.name,
      locationId: priceLists.locationId,
      locationName: fioLocations.name,
      price: priceLists.price,
      currency: priceLists.currency,
      source: priceLists.source,
      sourceReference: priceLists.sourceReference,
    })
    .from(priceLists)
    .leftJoin(fioCommodities, eq(priceLists.commodityTicker, fioCommodities.ticker))
    .leftJoin(fioLocations, eq(priceLists.locationId, fioLocations.naturalId))
    .where(
      and(
        eq(priceLists.exchangeCode, exchangeCode),
        eq(priceLists.commodityTicker, commodityTicker),
        eq(priceLists.locationId, location),
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
  // An adjustment matches if:
  // - exchangeCode is NULL (applies to all) OR matches the specific exchange
  // - commodityTicker is NULL (applies to all) OR matches the specific commodity
  // - locationId is NULL (applies to all) OR matches the specific location
  // - currency is NULL (applies to all) OR matches the specific currency
  // - isActive is true
  // - effectiveFrom is NULL OR <= now
  // - effectiveUntil is NULL OR > now
  const adjustmentResults = await db
    .select({
      id: priceAdjustments.id,
      exchangeCode: priceAdjustments.exchangeCode,
      commodityTicker: priceAdjustments.commodityTicker,
      locationId: priceAdjustments.locationId,
      currency: priceAdjustments.currency,
      adjustmentType: priceAdjustments.adjustmentType,
      adjustmentValue: priceAdjustments.adjustmentValue,
      priority: priceAdjustments.priority,
      description: priceAdjustments.description,
    })
    .from(priceAdjustments)
    .where(
      and(
        // Match exchange (NULL = wildcard)
        or(isNull(priceAdjustments.exchangeCode), eq(priceAdjustments.exchangeCode, exchangeCode)),
        // Match commodity (NULL = wildcard)
        or(
          isNull(priceAdjustments.commodityTicker),
          eq(priceAdjustments.commodityTicker, commodityTicker)
        ),
        // Match location (NULL = wildcard)
        or(isNull(priceAdjustments.locationId), eq(priceAdjustments.locationId, location)),
        // Match currency (NULL = wildcard)
        or(isNull(priceAdjustments.currency), eq(priceAdjustments.currency, currency)),
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
    exchangeCode: baseRecord.exchangeCode,
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
  }
}

/**
 * Calculate effective prices for all commodities at a specific exchange and location
 */
export async function calculateEffectivePrices(
  exchange: string,
  locationId: string,
  currency: Currency
): Promise<EffectivePrice[]> {
  const exchangeCode = exchange.toUpperCase()
  const location = locationId.toUpperCase()

  // Get all base prices for this exchange/location/currency
  const basePriceResults = await db
    .select({
      exchangeCode: priceLists.exchangeCode,
      commodityTicker: priceLists.commodityTicker,
      commodityName: fioCommodities.name,
      locationId: priceLists.locationId,
      locationName: fioLocations.name,
      price: priceLists.price,
      currency: priceLists.currency,
      source: priceLists.source,
      sourceReference: priceLists.sourceReference,
    })
    .from(priceLists)
    .leftJoin(fioCommodities, eq(priceLists.commodityTicker, fioCommodities.ticker))
    .leftJoin(fioLocations, eq(priceLists.locationId, fioLocations.naturalId))
    .where(
      and(
        eq(priceLists.exchangeCode, exchangeCode),
        eq(priceLists.locationId, location),
        eq(priceLists.currency, currency)
      )
    )
    .orderBy(priceLists.commodityTicker)

  // For efficiency, get all potentially matching adjustments once
  const now = new Date()
  const allAdjustments = await db
    .select({
      id: priceAdjustments.id,
      exchangeCode: priceAdjustments.exchangeCode,
      commodityTicker: priceAdjustments.commodityTicker,
      locationId: priceAdjustments.locationId,
      currency: priceAdjustments.currency,
      adjustmentType: priceAdjustments.adjustmentType,
      adjustmentValue: priceAdjustments.adjustmentValue,
      priority: priceAdjustments.priority,
      description: priceAdjustments.description,
    })
    .from(priceAdjustments)
    .where(
      and(
        // Must match exchange or be global
        or(isNull(priceAdjustments.exchangeCode), eq(priceAdjustments.exchangeCode, exchangeCode)),
        // Must match location or be global
        or(isNull(priceAdjustments.locationId), eq(priceAdjustments.locationId, location)),
        // Must match currency or be global
        or(isNull(priceAdjustments.currency), eq(priceAdjustments.currency, currency)),
        // Must be active
        eq(priceAdjustments.isActive, true),
        // Must be in effective date range
        or(isNull(priceAdjustments.effectiveFrom), lte(priceAdjustments.effectiveFrom, now)),
        or(isNull(priceAdjustments.effectiveUntil), gt(priceAdjustments.effectiveUntil, now))
      )
    )
    .orderBy(priceAdjustments.priority, priceAdjustments.id)

  // Process each base price
  const results: EffectivePrice[] = []

  for (const baseRecord of basePriceResults) {
    const basePrice = parseFloat(baseRecord.price)

    // Filter adjustments that apply to this specific commodity
    const applicableAdjustments = allAdjustments.filter(
      adj => adj.commodityTicker === null || adj.commodityTicker === baseRecord.commodityTicker
    )

    // Apply adjustments
    let currentPrice = basePrice
    const appliedAdjustments: AppliedAdjustment[] = []

    for (const adj of applicableAdjustments) {
      const adjustmentValue = parseFloat(adj.adjustmentValue)
      let appliedAmount: number

      if (adj.adjustmentType === 'percentage') {
        appliedAmount = currentPrice * (adjustmentValue / 100)
        currentPrice = currentPrice + appliedAmount
      } else {
        appliedAmount = adjustmentValue
        currentPrice = currentPrice + appliedAmount
      }

      appliedAdjustments.push({
        id: adj.id,
        description: adj.description,
        type: adj.adjustmentType,
        value: adjustmentValue,
        appliedAmount: Math.round(appliedAmount * 100) / 100,
      })
    }

    const finalPrice = Math.round(currentPrice * 100) / 100

    results.push({
      exchangeCode: baseRecord.exchangeCode,
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
    })
  }

  return results
}
