import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Query,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import type { Currency } from '@kawakawa/types'
import { db, prices, priceLists, fioCommodities, fioLocations } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import { NotFound, BadRequest, Conflict } from '../utils/errors.js'
import {
  calculateEffectivePrice,
  calculateEffectivePrices,
  type EffectivePrice,
  type PriceSource,
} from '../services/price-calculator.js'

export interface PriceListResponse {
  id: number
  priceListCode: string
  commodityTicker: string
  commodityName: string | null
  locationId: string
  locationName: string | null
  price: string
  currency: Currency // Derived from price list
  source: PriceSource
  sourceReference: string | null
  createdAt: Date
  updatedAt: Date
  // Backwards compatibility
  exchangeCode: string
}

interface CreatePriceRequest {
  exchangeCode: string // Still use exchangeCode for backwards compat, maps to priceListCode
  commodityTicker: string
  locationId: string
  price: number
  source?: PriceSource
  sourceReference?: string | null
  // Note: currency is not provided - it comes from the price list
}

interface UpdatePriceRequest {
  price?: number
  source?: PriceSource
  sourceReference?: string | null
  // Note: currency cannot be updated - it's determined by the price list
}

@Route('prices')
@Tags('Pricing')
export class PriceListController extends Controller {
  /**
   * Get all prices with optional filters
   * @param exchange Filter by exchange code (KAWA, CI1, etc.)
   * @param location Filter by location ID
   * @param commodity Filter by commodity ticker
   */
  @Get()
  public async getPrices(
    @Query() exchange?: string,
    @Query() location?: string,
    @Query() commodity?: string
  ): Promise<PriceListResponse[]> {
    // Build dynamic where conditions
    const conditions = []
    if (exchange) {
      conditions.push(eq(prices.priceListCode, exchange.toUpperCase()))
    }
    if (location) {
      conditions.push(eq(prices.locationId, location)) // Location IDs are case-sensitive
    }
    if (commodity) {
      conditions.push(eq(prices.commodityTicker, commodity.toUpperCase()))
    }

    const results = await db
      .select({
        id: prices.id,
        priceListCode: prices.priceListCode,
        commodityTicker: prices.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: prices.locationId,
        locationName: fioLocations.name,
        price: prices.price,
        currency: priceLists.currency, // Currency from price list
        source: prices.source,
        sourceReference: prices.sourceReference,
        createdAt: prices.createdAt,
        updatedAt: prices.updatedAt,
      })
      .from(prices)
      .innerJoin(priceLists, eq(prices.priceListCode, priceLists.code))
      .leftJoin(fioCommodities, eq(prices.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(prices.locationId, fioLocations.naturalId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(prices.priceListCode, prices.commodityTicker, prices.locationId)

    return results.map(r => ({
      ...r,
      exchangeCode: r.priceListCode, // Backwards compatibility
    }))
  }

  // ============================================================
  // ROUTES WITH LITERAL PREFIXES (must come before wildcard routes)
  // ============================================================

  /**
   * Get effective price (base + adjustments) for a specific commodity
   * @param exchange The exchange code (KAWA, CI1, etc.)
   * @param locationId The location ID
   * @param ticker The commodity ticker
   * @param fallback Falls back to default location when price not found (default: true)
   */
  @Get('effective/{exchange}/{locationId}/{ticker}')
  public async getEffectivePrice(
    @Path() exchange: string,
    @Path() locationId: string,
    @Path() ticker: string,
    @Query() fallback?: boolean
  ): Promise<EffectivePrice> {
    // Default fallback to true
    const useFallback = fallback !== false

    // Get currency and default location from price list
    const priceList = await db
      .select({
        currency: priceLists.currency,
        defaultLocationId: priceLists.defaultLocationId,
      })
      .from(priceLists)
      .where(eq(priceLists.code, exchange.toUpperCase()))
      .limit(1)

    if (priceList.length === 0) {
      throw NotFound(`Price list '${exchange.toUpperCase()}' not found`)
    }

    // First try the requested location
    let result = await calculateEffectivePrice(exchange, ticker, locationId, priceList[0].currency)

    // If no result and fallback is enabled, try default location
    if (
      result === null &&
      useFallback &&
      priceList[0].defaultLocationId &&
      priceList[0].defaultLocationId !== locationId
    ) {
      result = await calculateEffectivePrice(
        exchange,
        ticker,
        priceList[0].defaultLocationId,
        priceList[0].currency
      )

      // Mark result as fallback with the original requested location
      if (result) {
        result = {
          ...result,
          isFallback: true,
          requestedLocationId: locationId,
        }
      }
    }

    if (result === null) {
      throw NotFound(
        `Price for ${ticker.toUpperCase()} at ${locationId} on ${exchange.toUpperCase()} not found`
      )
    }

    return result
  }

  /**
   * Get all effective prices for an exchange and location
   * @param exchange The exchange code
   * @param locationId The location ID
   * @param commodity Optional commodity ticker to filter results
   * @param fallback Falls back to default location when no prices found (default: true)
   */
  @Get('effective/{exchange}/{locationId}')
  public async getEffectivePrices(
    @Path() exchange: string,
    @Path() locationId: string,
    @Query() commodity?: string,
    @Query() fallback?: boolean
  ): Promise<EffectivePrice[]> {
    // Default fallback to true
    const useFallback = fallback !== false

    // Get currency and default location from price list
    const priceList = await db
      .select({
        currency: priceLists.currency,
        defaultLocationId: priceLists.defaultLocationId,
      })
      .from(priceLists)
      .where(eq(priceLists.code, exchange.toUpperCase()))
      .limit(1)

    if (priceList.length === 0) {
      throw NotFound(`Price list '${exchange.toUpperCase()}' not found`)
    }

    // First try the requested location
    let results = await calculateEffectivePrices(exchange, locationId, priceList[0].currency)

    // Filter by commodity if specified
    if (commodity) {
      const upperCommodity = commodity.toUpperCase()
      results = results.filter(r => r.commodityTicker === upperCommodity)
    }

    // If no results and fallback is enabled, try default location
    if (
      results.length === 0 &&
      useFallback &&
      priceList[0].defaultLocationId &&
      priceList[0].defaultLocationId !== locationId
    ) {
      results = await calculateEffectivePrices(
        exchange,
        priceList[0].defaultLocationId,
        priceList[0].currency
      )

      // Filter by commodity if specified
      if (commodity) {
        const upperCommodity = commodity.toUpperCase()
        results = results.filter(r => r.commodityTicker === upperCommodity)
      }

      // Mark all results as fallback with the original requested location
      results = results.map(price => ({
        ...price,
        isFallback: true,
        requestedLocationId: locationId,
      }))
    }

    return results
  }

  /**
   * Export base prices as CSV for an exchange
   * @param exchange The exchange code (KAWA, CI1, etc.)
   * @param location Optional location filter
   */
  @Get('export/{exchange}')
  public async exportBasePrices(
    @Path() exchange: string,
    @Query() location?: string
  ): Promise<string> {
    const conditions = [eq(prices.priceListCode, exchange.toUpperCase())]
    if (location) {
      conditions.push(eq(prices.locationId, location)) // Location IDs are case-sensitive
    }

    const results = await db
      .select({
        priceListCode: prices.priceListCode,
        commodityTicker: prices.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: prices.locationId,
        locationName: fioLocations.name,
        price: prices.price,
        currency: priceLists.currency,
        source: prices.source,
        updatedAt: prices.updatedAt,
      })
      .from(prices)
      .innerJoin(priceLists, eq(prices.priceListCode, priceLists.code))
      .leftJoin(fioCommodities, eq(prices.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(prices.locationId, fioLocations.naturalId))
      .where(and(...conditions))
      .orderBy(prices.commodityTicker, prices.locationId)

    // Build CSV
    const headers = [
      'Ticker',
      'Name',
      'Location',
      'LocationName',
      'Price',
      'Currency',
      'Source',
      'UpdatedAt',
    ]
    const rows = results.map(r => [
      r.commodityTicker,
      r.commodityName ?? '',
      r.locationId,
      r.locationName ?? '',
      r.price,
      r.currency,
      r.source,
      r.updatedAt?.toISOString() ?? '',
    ])

    const csv = [headers.join(','), ...rows.map(row => row.map(escapeCsvField).join(','))].join(
      '\n'
    )

    this.setHeader('Content-Type', 'text/csv')
    this.setHeader(
      'Content-Disposition',
      `attachment; filename="${exchange.toUpperCase()}-base-prices.csv"`
    )

    return csv
  }

  /**
   * Export effective prices (with adjustments applied) as CSV for an exchange
   * @param exchange The exchange code (KAWA, CI1, etc.)
   * @param locationId The location ID
   */
  @Get('export/{exchange}/{locationId}/effective')
  public async exportEffectivePrices(
    @Path() exchange: string,
    @Path() locationId: string
  ): Promise<string> {
    // Get currency from price list
    const priceList = await db
      .select({ currency: priceLists.currency })
      .from(priceLists)
      .where(eq(priceLists.code, exchange.toUpperCase()))
      .limit(1)

    if (priceList.length === 0) {
      throw NotFound(`Price list '${exchange.toUpperCase()}' not found`)
    }

    const results = await calculateEffectivePrices(exchange, locationId, priceList[0].currency)

    // Build CSV
    const headers = [
      'Ticker',
      'Name',
      'Location',
      'LocationName',
      'BasePrice',
      'FinalPrice',
      'Currency',
      'AdjustmentCount',
      'Source',
    ]
    const rows = results.map(r => [
      r.commodityTicker,
      r.commodityName ?? '',
      r.locationId,
      r.locationName ?? '',
      r.basePrice.toFixed(2),
      r.finalPrice.toFixed(2),
      r.currency,
      r.adjustments.length.toString(),
      r.source,
    ])

    const csv = [headers.join(','), ...rows.map(row => row.map(escapeCsvField).join(','))].join(
      '\n'
    )

    this.setHeader('Content-Type', 'text/csv')
    this.setHeader(
      'Content-Disposition',
      `attachment; filename="${exchange.toUpperCase()}-${locationId}-effective-prices.csv"`
    )

    return csv
  }

  // ============================================================
  // WILDCARD ROUTES (must come after literal prefix routes)
  // ============================================================

  /**
   * Get prices for a specific exchange
   * @param exchange The exchange code (KAWA, CI1, NC1, IC1, AI1)
   */
  @Get('{exchange}')
  public async getPricesByExchange(@Path() exchange: string): Promise<PriceListResponse[]> {
    const results = await db
      .select({
        id: prices.id,
        priceListCode: prices.priceListCode,
        commodityTicker: prices.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: prices.locationId,
        locationName: fioLocations.name,
        price: prices.price,
        currency: priceLists.currency,
        source: prices.source,
        sourceReference: prices.sourceReference,
        createdAt: prices.createdAt,
        updatedAt: prices.updatedAt,
      })
      .from(prices)
      .innerJoin(priceLists, eq(prices.priceListCode, priceLists.code))
      .leftJoin(fioCommodities, eq(prices.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(prices.locationId, fioLocations.naturalId))
      .where(eq(prices.priceListCode, exchange.toUpperCase()))
      .orderBy(prices.commodityTicker, prices.locationId)

    return results.map(r => ({
      ...r,
      exchangeCode: r.priceListCode,
    }))
  }

  /**
   * Get prices for a specific exchange at a specific location
   * @param exchange The exchange code
   * @param locationId The location ID
   */
  @Get('{exchange}/{locationId}')
  public async getPricesByExchangeAndLocation(
    @Path() exchange: string,
    @Path() locationId: string
  ): Promise<PriceListResponse[]> {
    const results = await db
      .select({
        id: prices.id,
        priceListCode: prices.priceListCode,
        commodityTicker: prices.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: prices.locationId,
        locationName: fioLocations.name,
        price: prices.price,
        currency: priceLists.currency,
        source: prices.source,
        sourceReference: prices.sourceReference,
        createdAt: prices.createdAt,
        updatedAt: prices.updatedAt,
      })
      .from(prices)
      .innerJoin(priceLists, eq(prices.priceListCode, priceLists.code))
      .leftJoin(fioCommodities, eq(prices.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(prices.locationId, fioLocations.naturalId))
      .where(
        and(
          eq(prices.priceListCode, exchange.toUpperCase()),
          eq(prices.locationId, locationId) // Location IDs are case-sensitive
        )
      )
      .orderBy(prices.commodityTicker)

    return results.map(r => ({
      ...r,
      exchangeCode: r.priceListCode,
    }))
  }

  /**
   * Get a specific price by exchange, location, and commodity
   * @param exchange The exchange code
   * @param locationId The location ID
   * @param ticker The commodity ticker
   */
  @Get('{exchange}/{locationId}/{ticker}')
  public async getPrice(
    @Path() exchange: string,
    @Path() locationId: string,
    @Path() ticker: string
  ): Promise<PriceListResponse> {
    const results = await db
      .select({
        id: prices.id,
        priceListCode: prices.priceListCode,
        commodityTicker: prices.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: prices.locationId,
        locationName: fioLocations.name,
        price: prices.price,
        currency: priceLists.currency,
        source: prices.source,
        sourceReference: prices.sourceReference,
        createdAt: prices.createdAt,
        updatedAt: prices.updatedAt,
      })
      .from(prices)
      .innerJoin(priceLists, eq(prices.priceListCode, priceLists.code))
      .leftJoin(fioCommodities, eq(prices.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(prices.locationId, fioLocations.naturalId))
      .where(
        and(
          eq(prices.priceListCode, exchange.toUpperCase()),
          eq(prices.locationId, locationId), // Location IDs are case-sensitive
          eq(prices.commodityTicker, ticker.toUpperCase())
        )
      )
      .limit(1)

    if (results.length === 0) {
      throw NotFound(
        `Price for ${ticker.toUpperCase()} at ${locationId} on ${exchange.toUpperCase()} not found`
      )
    }

    return {
      ...results[0],
      exchangeCode: results[0].priceListCode,
    }
  }

  /**
   * Create a new price entry
   * @param body The price data
   */
  @Post()
  @Security('jwt', ['prices.manage'])
  @SuccessResponse('201', 'Created')
  public async createPrice(@Body() body: CreatePriceRequest): Promise<PriceListResponse> {
    const priceListCode = body.exchangeCode.toUpperCase()
    const commodityTicker = body.commodityTicker.toUpperCase()
    const locationId = body.locationId // Location IDs are case-sensitive

    // Validate price list exists
    const priceListExists = await db
      .select({ code: priceLists.code })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceListExists.length === 0) {
      throw BadRequest(`Exchange '${priceListCode}' not found`)
    }

    // Validate commodity exists
    const commodityExists = await db
      .select({ ticker: fioCommodities.ticker })
      .from(fioCommodities)
      .where(eq(fioCommodities.ticker, commodityTicker))
      .limit(1)

    if (commodityExists.length === 0) {
      throw BadRequest(`Commodity '${commodityTicker}' not found`)
    }

    // Validate location exists
    const locationExists = await db
      .select({ naturalId: fioLocations.naturalId })
      .from(fioLocations)
      .where(eq(fioLocations.naturalId, locationId))
      .limit(1)

    if (locationExists.length === 0) {
      throw BadRequest(`Location '${locationId}' not found`)
    }

    // Check if price already exists (unique: priceListCode + commodityTicker + locationId)
    const existing = await db
      .select({ id: prices.id })
      .from(prices)
      .where(
        and(
          eq(prices.priceListCode, priceListCode),
          eq(prices.commodityTicker, commodityTicker),
          eq(prices.locationId, locationId)
        )
      )
      .limit(1)

    if (existing.length > 0) {
      throw Conflict(
        `Price for ${commodityTicker} at ${locationId} on ${priceListCode} already exists`
      )
    }

    // Insert the price
    await db.insert(prices).values({
      priceListCode,
      commodityTicker,
      locationId,
      price: body.price.toFixed(2),
      source: body.source ?? 'manual',
      sourceReference: body.sourceReference ?? null,
    })

    this.setStatus(201)

    // Fetch and return the created price
    return this.getPrice(priceListCode, locationId, commodityTicker)
  }

  /**
   * Update an existing price
   * @param id The price ID
   * @param body The fields to update
   */
  @Put('{id}')
  @Security('jwt', ['prices.manage'])
  public async updatePrice(
    @Path() id: number,
    @Body() body: UpdatePriceRequest
  ): Promise<PriceListResponse> {
    // Check if price exists
    const existing = await db
      .select({
        id: prices.id,
        priceListCode: prices.priceListCode,
        commodityTicker: prices.commodityTicker,
        locationId: prices.locationId,
      })
      .from(prices)
      .where(eq(prices.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Price with ID ${id} not found`)
    }

    // Build update object
    const updateData: Partial<{
      price: string
      source: PriceSource
      sourceReference: string | null
      updatedAt: Date
    }> = {
      updatedAt: new Date(),
    }

    if (body.price !== undefined) updateData.price = body.price.toFixed(2)
    if (body.source !== undefined) updateData.source = body.source
    if (body.sourceReference !== undefined) updateData.sourceReference = body.sourceReference

    await db.update(prices).set(updateData).where(eq(prices.id, id))

    // Fetch and return updated price
    const record = existing[0]
    return this.getPrice(record.priceListCode, record.locationId, record.commodityTicker)
  }

  /**
   * Delete a price entry
   * @param id The price ID
   */
  @Delete('{id}')
  @Security('jwt', ['prices.manage'])
  @SuccessResponse('204', 'Deleted')
  public async deletePrice(@Path() id: number): Promise<void> {
    // Check if price exists
    const existing = await db
      .select({ id: prices.id })
      .from(prices)
      .where(eq(prices.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Price with ID ${id} not found`)
    }

    await db.delete(prices).where(eq(prices.id, id))
    this.setStatus(204)
  }
}

/**
 * Escape a field for CSV output
 * Wraps in quotes and escapes internal quotes if necessary
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
