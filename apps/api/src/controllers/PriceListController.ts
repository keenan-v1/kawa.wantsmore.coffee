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
import { db, priceLists, fioCommodities, fioLocations, fioExchanges } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import { NotFound, BadRequest, Conflict } from '../utils/errors.js'
import {
  calculateEffectivePrice,
  calculateEffectivePrices,
  type EffectivePrice,
  type PriceSource,
} from '../services/price-calculator.js'

interface PriceListResponse {
  id: number
  exchangeCode: string
  commodityTicker: string
  commodityName: string | null
  locationId: string
  locationName: string | null
  price: string
  currency: Currency
  source: PriceSource
  sourceReference: string | null
  createdAt: Date
  updatedAt: Date
}

interface CreatePriceRequest {
  exchangeCode: string
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  source?: PriceSource
  sourceReference?: string | null
}

interface UpdatePriceRequest {
  price?: number
  currency?: Currency
  source?: PriceSource
  sourceReference?: string | null
}

@Route('prices')
@Tags('Pricing')
export class PriceListController extends Controller {
  /**
   * Get all prices with optional filters
   * @param exchange Filter by exchange code (KAWA, CI1, etc.)
   * @param location Filter by location ID
   * @param commodity Filter by commodity ticker
   * @param currency Filter by currency
   */
  @Get()
  public async getPrices(
    @Query() exchange?: string,
    @Query() location?: string,
    @Query() commodity?: string,
    @Query() currency?: Currency
  ): Promise<PriceListResponse[]> {
    // Build dynamic where conditions
    const conditions = []
    if (exchange) {
      conditions.push(eq(priceLists.exchangeCode, exchange.toUpperCase()))
    }
    if (location) {
      conditions.push(eq(priceLists.locationId, location.toUpperCase()))
    }
    if (commodity) {
      conditions.push(eq(priceLists.commodityTicker, commodity.toUpperCase()))
    }
    if (currency) {
      conditions.push(eq(priceLists.currency, currency))
    }

    const results = await db
      .select({
        id: priceLists.id,
        exchangeCode: priceLists.exchangeCode,
        commodityTicker: priceLists.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceLists.locationId,
        locationName: fioLocations.name,
        price: priceLists.price,
        currency: priceLists.currency,
        source: priceLists.source,
        sourceReference: priceLists.sourceReference,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(fioCommodities, eq(priceLists.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(priceLists.locationId, fioLocations.naturalId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(priceLists.exchangeCode, priceLists.commodityTicker, priceLists.locationId)

    return results
  }

  /**
   * Get prices for a specific exchange
   * @param exchange The exchange code (KAWA, CI1, NC1, IC1, AI1)
   */
  @Get('{exchange}')
  public async getPricesByExchange(@Path() exchange: string): Promise<PriceListResponse[]> {
    const results = await db
      .select({
        id: priceLists.id,
        exchangeCode: priceLists.exchangeCode,
        commodityTicker: priceLists.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceLists.locationId,
        locationName: fioLocations.name,
        price: priceLists.price,
        currency: priceLists.currency,
        source: priceLists.source,
        sourceReference: priceLists.sourceReference,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(fioCommodities, eq(priceLists.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(priceLists.locationId, fioLocations.naturalId))
      .where(eq(priceLists.exchangeCode, exchange.toUpperCase()))
      .orderBy(priceLists.commodityTicker, priceLists.locationId)

    return results
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
        id: priceLists.id,
        exchangeCode: priceLists.exchangeCode,
        commodityTicker: priceLists.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceLists.locationId,
        locationName: fioLocations.name,
        price: priceLists.price,
        currency: priceLists.currency,
        source: priceLists.source,
        sourceReference: priceLists.sourceReference,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(fioCommodities, eq(priceLists.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(priceLists.locationId, fioLocations.naturalId))
      .where(
        and(
          eq(priceLists.exchangeCode, exchange.toUpperCase()),
          eq(priceLists.locationId, locationId.toUpperCase())
        )
      )
      .orderBy(priceLists.commodityTicker)

    return results
  }

  /**
   * Get a specific price by exchange, location, and commodity
   * @param exchange The exchange code
   * @param locationId The location ID
   * @param ticker The commodity ticker
   * @param currency Optional currency filter
   */
  @Get('{exchange}/{locationId}/{ticker}')
  public async getPrice(
    @Path() exchange: string,
    @Path() locationId: string,
    @Path() ticker: string,
    @Query() currency?: Currency
  ): Promise<PriceListResponse> {
    const conditions = [
      eq(priceLists.exchangeCode, exchange.toUpperCase()),
      eq(priceLists.locationId, locationId.toUpperCase()),
      eq(priceLists.commodityTicker, ticker.toUpperCase()),
    ]
    if (currency) {
      conditions.push(eq(priceLists.currency, currency))
    }

    const results = await db
      .select({
        id: priceLists.id,
        exchangeCode: priceLists.exchangeCode,
        commodityTicker: priceLists.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceLists.locationId,
        locationName: fioLocations.name,
        price: priceLists.price,
        currency: priceLists.currency,
        source: priceLists.source,
        sourceReference: priceLists.sourceReference,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(fioCommodities, eq(priceLists.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(priceLists.locationId, fioLocations.naturalId))
      .where(and(...conditions))
      .limit(1)

    if (results.length === 0) {
      throw NotFound(
        `Price for ${ticker.toUpperCase()} at ${locationId.toUpperCase()} on ${exchange.toUpperCase()} not found`
      )
    }

    return results[0]
  }

  /**
   * Create a new price entry
   * @param body The price data
   */
  @Post()
  @Security('jwt', ['prices.manage'])
  @SuccessResponse('201', 'Created')
  public async createPrice(@Body() body: CreatePriceRequest): Promise<PriceListResponse> {
    const exchangeCode = body.exchangeCode.toUpperCase()
    const commodityTicker = body.commodityTicker.toUpperCase()
    const locationId = body.locationId.toUpperCase()

    // Validate exchange exists
    const exchangeExists = await db
      .select({ code: fioExchanges.code })
      .from(fioExchanges)
      .where(eq(fioExchanges.code, exchangeCode))
      .limit(1)

    if (exchangeExists.length === 0) {
      throw BadRequest(`Exchange '${exchangeCode}' not found`)
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

    // Check if price already exists
    const existing = await db
      .select({ id: priceLists.id })
      .from(priceLists)
      .where(
        and(
          eq(priceLists.exchangeCode, exchangeCode),
          eq(priceLists.commodityTicker, commodityTicker),
          eq(priceLists.locationId, locationId),
          eq(priceLists.currency, body.currency)
        )
      )
      .limit(1)

    if (existing.length > 0) {
      throw Conflict(
        `Price for ${commodityTicker} at ${locationId} on ${exchangeCode} (${body.currency}) already exists`
      )
    }

    // Insert the price
    await db.insert(priceLists).values({
      exchangeCode,
      commodityTicker,
      locationId,
      price: body.price.toFixed(2),
      currency: body.currency,
      source: body.source ?? 'manual',
      sourceReference: body.sourceReference ?? null,
    })

    this.setStatus(201)

    // Fetch and return the created price
    return this.getPrice(exchangeCode, locationId, commodityTicker, body.currency)
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
        id: priceLists.id,
        exchangeCode: priceLists.exchangeCode,
        commodityTicker: priceLists.commodityTicker,
        locationId: priceLists.locationId,
        currency: priceLists.currency,
      })
      .from(priceLists)
      .where(eq(priceLists.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Price with ID ${id} not found`)
    }

    // Build update object
    const updateData: Partial<{
      price: string
      currency: Currency
      source: PriceSource
      sourceReference: string | null
      updatedAt: Date
    }> = {
      updatedAt: new Date(),
    }

    if (body.price !== undefined) updateData.price = body.price.toFixed(2)
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.source !== undefined) updateData.source = body.source
    if (body.sourceReference !== undefined) updateData.sourceReference = body.sourceReference

    await db.update(priceLists).set(updateData).where(eq(priceLists.id, id))

    // Fetch and return updated price
    const record = existing[0]
    return this.getPrice(
      record.exchangeCode,
      record.locationId,
      record.commodityTicker,
      body.currency ?? record.currency
    )
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
      .select({ id: priceLists.id })
      .from(priceLists)
      .where(eq(priceLists.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Price with ID ${id} not found`)
    }

    await db.delete(priceLists).where(eq(priceLists.id, id))
    this.setStatus(204)
  }

  /**
   * Get effective price (base + adjustments) for a specific commodity
   * @param exchange The exchange code (KAWA, CI1, etc.)
   * @param locationId The location ID
   * @param ticker The commodity ticker
   * @param currency The currency
   */
  @Get('effective/{exchange}/{locationId}/{ticker}')
  public async getEffectivePrice(
    @Path() exchange: string,
    @Path() locationId: string,
    @Path() ticker: string,
    @Query() currency: Currency
  ): Promise<EffectivePrice> {
    const result = await calculateEffectivePrice(exchange, ticker, locationId, currency)

    if (result === null) {
      throw NotFound(
        `Price for ${ticker.toUpperCase()} at ${locationId.toUpperCase()} on ${exchange.toUpperCase()} not found`
      )
    }

    return result
  }

  /**
   * Get all effective prices for an exchange and location
   * @param exchange The exchange code
   * @param locationId The location ID
   * @param currency The currency
   */
  @Get('effective/{exchange}/{locationId}')
  public async getEffectivePrices(
    @Path() exchange: string,
    @Path() locationId: string,
    @Query() currency: Currency
  ): Promise<EffectivePrice[]> {
    return calculateEffectivePrices(exchange, locationId, currency)
  }

  /**
   * Export base prices as CSV for an exchange
   * @param exchange The exchange code (KAWA, CI1, etc.)
   * @param location Optional location filter
   * @param currency Optional currency filter
   */
  @Get('export/{exchange}')
  public async exportBasePrices(
    @Path() exchange: string,
    @Query() location?: string,
    @Query() currency?: Currency
  ): Promise<string> {
    const conditions = [eq(priceLists.exchangeCode, exchange.toUpperCase())]
    if (location) {
      conditions.push(eq(priceLists.locationId, location.toUpperCase()))
    }
    if (currency) {
      conditions.push(eq(priceLists.currency, currency))
    }

    const results = await db
      .select({
        exchangeCode: priceLists.exchangeCode,
        commodityTicker: priceLists.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceLists.locationId,
        locationName: fioLocations.name,
        price: priceLists.price,
        currency: priceLists.currency,
        source: priceLists.source,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(fioCommodities, eq(priceLists.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(priceLists.locationId, fioLocations.naturalId))
      .where(and(...conditions))
      .orderBy(priceLists.commodityTicker, priceLists.locationId)

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
   * @param currency The currency
   */
  @Get('export/{exchange}/{locationId}/effective')
  public async exportEffectivePrices(
    @Path() exchange: string,
    @Path() locationId: string,
    @Query() currency: Currency
  ): Promise<string> {
    const results = await calculateEffectivePrices(exchange, locationId, currency)

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
      `attachment; filename="${exchange.toUpperCase()}-${locationId.toUpperCase()}-effective-prices.csv"`
    )

    return csv
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
