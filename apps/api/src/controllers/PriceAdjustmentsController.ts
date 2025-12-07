import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Query,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import type { Currency } from '@kawakawa/types'
import {
  db,
  priceAdjustments,
  fioCommodities,
  fioLocations,
  fioExchanges,
  users,
} from '../db/index.js'
import { eq, and, or, isNull } from 'drizzle-orm'
import { NotFound, BadRequest } from '../utils/errors.js'
import { AuthenticatedRequest } from '../middleware/auth.js'
import type { AdjustmentType } from '../services/price-calculator.js'

interface PriceAdjustmentResponse {
  id: number
  exchangeCode: string | null
  commodityTicker: string | null
  commodityName: string | null
  locationId: string | null
  locationName: string | null
  currency: Currency | null
  adjustmentType: AdjustmentType
  adjustmentValue: string
  priority: number
  description: string | null
  isActive: boolean
  effectiveFrom: Date | null
  effectiveUntil: Date | null
  createdByUserId: number | null
  createdByUsername: string | null
  createdAt: Date
  updatedAt: Date
}

interface CreatePriceAdjustmentRequest {
  exchangeCode?: string | null
  commodityTicker?: string | null
  locationId?: string | null
  currency?: Currency | null
  adjustmentType: AdjustmentType
  adjustmentValue: number
  priority?: number
  description?: string | null
  isActive?: boolean
  effectiveFrom?: string | null
  effectiveUntil?: string | null
}

interface UpdatePriceAdjustmentRequest {
  exchangeCode?: string | null
  commodityTicker?: string | null
  locationId?: string | null
  currency?: Currency | null
  adjustmentType?: AdjustmentType
  adjustmentValue?: number
  priority?: number
  description?: string | null
  isActive?: boolean
  effectiveFrom?: string | null
  effectiveUntil?: string | null
}

@Route('price-adjustments')
@Tags('Pricing')
export class PriceAdjustmentsController extends Controller {
  /**
   * Get all price adjustments with optional filters
   * @param exchange Filter by exchange code (exact match or NULL)
   * @param location Filter by location ID (exact match or NULL)
   * @param activeOnly Only return active adjustments
   */
  @Get()
  public async getAdjustments(
    @Query() exchange?: string,
    @Query() location?: string,
    @Query() activeOnly?: boolean
  ): Promise<PriceAdjustmentResponse[]> {
    const conditions = []

    if (exchange) {
      conditions.push(
        or(
          eq(priceAdjustments.exchangeCode, exchange.toUpperCase()),
          isNull(priceAdjustments.exchangeCode)
        )
      )
    }

    if (location) {
      conditions.push(
        or(
          eq(priceAdjustments.locationId, location.toUpperCase()),
          isNull(priceAdjustments.locationId)
        )
      )
    }

    if (activeOnly) {
      conditions.push(eq(priceAdjustments.isActive, true))
    }

    const results = await db
      .select({
        id: priceAdjustments.id,
        exchangeCode: priceAdjustments.exchangeCode,
        commodityTicker: priceAdjustments.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceAdjustments.locationId,
        locationName: fioLocations.name,
        currency: priceAdjustments.currency,
        adjustmentType: priceAdjustments.adjustmentType,
        adjustmentValue: priceAdjustments.adjustmentValue,
        priority: priceAdjustments.priority,
        description: priceAdjustments.description,
        isActive: priceAdjustments.isActive,
        effectiveFrom: priceAdjustments.effectiveFrom,
        effectiveUntil: priceAdjustments.effectiveUntil,
        createdByUserId: priceAdjustments.createdByUserId,
        createdByUsername: users.username,
        createdAt: priceAdjustments.createdAt,
        updatedAt: priceAdjustments.updatedAt,
      })
      .from(priceAdjustments)
      .leftJoin(fioCommodities, eq(priceAdjustments.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(priceAdjustments.locationId, fioLocations.naturalId))
      .leftJoin(users, eq(priceAdjustments.createdByUserId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(priceAdjustments.priority, priceAdjustments.id)

    return results
  }

  /**
   * Get adjustments that apply to a specific exchange
   * @param exchange The exchange code
   */
  @Get('exchange/{exchange}')
  public async getAdjustmentsByExchange(
    @Path() exchange: string
  ): Promise<PriceAdjustmentResponse[]> {
    // Get adjustments that specifically target this exchange OR apply globally
    const results = await db
      .select({
        id: priceAdjustments.id,
        exchangeCode: priceAdjustments.exchangeCode,
        commodityTicker: priceAdjustments.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceAdjustments.locationId,
        locationName: fioLocations.name,
        currency: priceAdjustments.currency,
        adjustmentType: priceAdjustments.adjustmentType,
        adjustmentValue: priceAdjustments.adjustmentValue,
        priority: priceAdjustments.priority,
        description: priceAdjustments.description,
        isActive: priceAdjustments.isActive,
        effectiveFrom: priceAdjustments.effectiveFrom,
        effectiveUntil: priceAdjustments.effectiveUntil,
        createdByUserId: priceAdjustments.createdByUserId,
        createdByUsername: users.username,
        createdAt: priceAdjustments.createdAt,
        updatedAt: priceAdjustments.updatedAt,
      })
      .from(priceAdjustments)
      .leftJoin(fioCommodities, eq(priceAdjustments.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(priceAdjustments.locationId, fioLocations.naturalId))
      .leftJoin(users, eq(priceAdjustments.createdByUserId, users.id))
      .where(
        or(
          eq(priceAdjustments.exchangeCode, exchange.toUpperCase()),
          isNull(priceAdjustments.exchangeCode)
        )
      )
      .orderBy(priceAdjustments.priority, priceAdjustments.id)

    return results
  }

  /**
   * Get adjustments that apply to a specific location
   * @param locationId The location ID
   */
  @Get('location/{locationId}')
  public async getAdjustmentsByLocation(
    @Path() locationId: string
  ): Promise<PriceAdjustmentResponse[]> {
    // Get adjustments that specifically target this location OR apply globally
    const results = await db
      .select({
        id: priceAdjustments.id,
        exchangeCode: priceAdjustments.exchangeCode,
        commodityTicker: priceAdjustments.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceAdjustments.locationId,
        locationName: fioLocations.name,
        currency: priceAdjustments.currency,
        adjustmentType: priceAdjustments.adjustmentType,
        adjustmentValue: priceAdjustments.adjustmentValue,
        priority: priceAdjustments.priority,
        description: priceAdjustments.description,
        isActive: priceAdjustments.isActive,
        effectiveFrom: priceAdjustments.effectiveFrom,
        effectiveUntil: priceAdjustments.effectiveUntil,
        createdByUserId: priceAdjustments.createdByUserId,
        createdByUsername: users.username,
        createdAt: priceAdjustments.createdAt,
        updatedAt: priceAdjustments.updatedAt,
      })
      .from(priceAdjustments)
      .leftJoin(fioCommodities, eq(priceAdjustments.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(priceAdjustments.locationId, fioLocations.naturalId))
      .leftJoin(users, eq(priceAdjustments.createdByUserId, users.id))
      .where(
        or(
          eq(priceAdjustments.locationId, locationId.toUpperCase()),
          isNull(priceAdjustments.locationId)
        )
      )
      .orderBy(priceAdjustments.priority, priceAdjustments.id)

    return results
  }

  /**
   * Get a specific adjustment by ID
   * @param id The adjustment ID
   */
  @Get('{id}')
  public async getAdjustment(@Path() id: number): Promise<PriceAdjustmentResponse> {
    const results = await db
      .select({
        id: priceAdjustments.id,
        exchangeCode: priceAdjustments.exchangeCode,
        commodityTicker: priceAdjustments.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceAdjustments.locationId,
        locationName: fioLocations.name,
        currency: priceAdjustments.currency,
        adjustmentType: priceAdjustments.adjustmentType,
        adjustmentValue: priceAdjustments.adjustmentValue,
        priority: priceAdjustments.priority,
        description: priceAdjustments.description,
        isActive: priceAdjustments.isActive,
        effectiveFrom: priceAdjustments.effectiveFrom,
        effectiveUntil: priceAdjustments.effectiveUntil,
        createdByUserId: priceAdjustments.createdByUserId,
        createdByUsername: users.username,
        createdAt: priceAdjustments.createdAt,
        updatedAt: priceAdjustments.updatedAt,
      })
      .from(priceAdjustments)
      .leftJoin(fioCommodities, eq(priceAdjustments.commodityTicker, fioCommodities.ticker))
      .leftJoin(fioLocations, eq(priceAdjustments.locationId, fioLocations.naturalId))
      .leftJoin(users, eq(priceAdjustments.createdByUserId, users.id))
      .where(eq(priceAdjustments.id, id))
      .limit(1)

    if (results.length === 0) {
      throw NotFound(`Adjustment with ID ${id} not found`)
    }

    return results[0]
  }

  /**
   * Create a new price adjustment
   * @param body The adjustment data
   */
  @Post()
  @Security('jwt', ['adjustments.manage'])
  @SuccessResponse('201', 'Created')
  public async createAdjustment(
    @Body() body: CreatePriceAdjustmentRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<PriceAdjustmentResponse> {
    const exchangeCode = body.exchangeCode?.toUpperCase() ?? null
    const commodityTicker = body.commodityTicker?.toUpperCase() ?? null
    const locationId = body.locationId?.toUpperCase() ?? null

    // Validate exchange if provided
    if (exchangeCode) {
      const exchangeExists = await db
        .select({ code: fioExchanges.code })
        .from(fioExchanges)
        .where(eq(fioExchanges.code, exchangeCode))
        .limit(1)

      if (exchangeExists.length === 0) {
        throw BadRequest(`Exchange '${exchangeCode}' not found`)
      }
    }

    // Validate commodity if provided
    if (commodityTicker) {
      const commodityExists = await db
        .select({ ticker: fioCommodities.ticker })
        .from(fioCommodities)
        .where(eq(fioCommodities.ticker, commodityTicker))
        .limit(1)

      if (commodityExists.length === 0) {
        throw BadRequest(`Commodity '${commodityTicker}' not found`)
      }
    }

    // Validate location if provided
    if (locationId) {
      const locationExists = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, locationId))
        .limit(1)

      if (locationExists.length === 0) {
        throw BadRequest(`Location '${locationId}' not found`)
      }
    }

    // Insert the adjustment
    const [inserted] = await db
      .insert(priceAdjustments)
      .values({
        exchangeCode,
        commodityTicker,
        locationId,
        currency: body.currency ?? null,
        adjustmentType: body.adjustmentType,
        adjustmentValue: body.adjustmentValue.toFixed(4),
        priority: body.priority ?? 0,
        description: body.description ?? null,
        isActive: body.isActive ?? true,
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
        effectiveUntil: body.effectiveUntil ? new Date(body.effectiveUntil) : null,
        createdByUserId: request.user!.userId,
      })
      .returning({ id: priceAdjustments.id })

    this.setStatus(201)

    return this.getAdjustment(inserted.id)
  }

  /**
   * Update an existing price adjustment
   * @param id The adjustment ID
   * @param body The fields to update
   */
  @Put('{id}')
  @Security('jwt', ['adjustments.manage'])
  public async updateAdjustment(
    @Path() id: number,
    @Body() body: UpdatePriceAdjustmentRequest
  ): Promise<PriceAdjustmentResponse> {
    // Check if adjustment exists
    const existing = await db
      .select({ id: priceAdjustments.id })
      .from(priceAdjustments)
      .where(eq(priceAdjustments.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Adjustment with ID ${id} not found`)
    }

    // Validate exchange if being updated to a specific value
    if (body.exchangeCode !== undefined && body.exchangeCode !== null) {
      const exchangeCode = body.exchangeCode.toUpperCase()
      const exchangeExists = await db
        .select({ code: fioExchanges.code })
        .from(fioExchanges)
        .where(eq(fioExchanges.code, exchangeCode))
        .limit(1)

      if (exchangeExists.length === 0) {
        throw BadRequest(`Exchange '${exchangeCode}' not found`)
      }
    }

    // Validate commodity if being updated to a specific value
    if (body.commodityTicker !== undefined && body.commodityTicker !== null) {
      const commodityTicker = body.commodityTicker.toUpperCase()
      const commodityExists = await db
        .select({ ticker: fioCommodities.ticker })
        .from(fioCommodities)
        .where(eq(fioCommodities.ticker, commodityTicker))
        .limit(1)

      if (commodityExists.length === 0) {
        throw BadRequest(`Commodity '${commodityTicker}' not found`)
      }
    }

    // Validate location if being updated to a specific value
    if (body.locationId !== undefined && body.locationId !== null) {
      const locationId = body.locationId.toUpperCase()
      const locationExists = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, locationId))
        .limit(1)

      if (locationExists.length === 0) {
        throw BadRequest(`Location '${locationId}' not found`)
      }
    }

    // Build update object
    const updateData: Partial<{
      exchangeCode: string | null
      commodityTicker: string | null
      locationId: string | null
      currency: Currency | null
      adjustmentType: AdjustmentType
      adjustmentValue: string
      priority: number
      description: string | null
      isActive: boolean
      effectiveFrom: Date | null
      effectiveUntil: Date | null
      updatedAt: Date
    }> = {
      updatedAt: new Date(),
    }

    if (body.exchangeCode !== undefined) {
      updateData.exchangeCode = body.exchangeCode?.toUpperCase() ?? null
    }
    if (body.commodityTicker !== undefined) {
      updateData.commodityTicker = body.commodityTicker?.toUpperCase() ?? null
    }
    if (body.locationId !== undefined) {
      updateData.locationId = body.locationId?.toUpperCase() ?? null
    }
    if (body.currency !== undefined) {
      updateData.currency = body.currency
    }
    if (body.adjustmentType !== undefined) {
      updateData.adjustmentType = body.adjustmentType
    }
    if (body.adjustmentValue !== undefined) {
      updateData.adjustmentValue = body.adjustmentValue.toFixed(4)
    }
    if (body.priority !== undefined) {
      updateData.priority = body.priority
    }
    if (body.description !== undefined) {
      updateData.description = body.description
    }
    if (body.isActive !== undefined) {
      updateData.isActive = body.isActive
    }
    if (body.effectiveFrom !== undefined) {
      updateData.effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : null
    }
    if (body.effectiveUntil !== undefined) {
      updateData.effectiveUntil = body.effectiveUntil ? new Date(body.effectiveUntil) : null
    }

    await db.update(priceAdjustments).set(updateData).where(eq(priceAdjustments.id, id))

    return this.getAdjustment(id)
  }

  /**
   * Delete a price adjustment
   * @param id The adjustment ID
   */
  @Delete('{id}')
  @Security('jwt', ['adjustments.manage'])
  @SuccessResponse('204', 'Deleted')
  public async deleteAdjustment(@Path() id: number): Promise<void> {
    // Check if adjustment exists
    const existing = await db
      .select({ id: priceAdjustments.id })
      .from(priceAdjustments)
      .where(eq(priceAdjustments.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Adjustment with ID ${id} not found`)
    }

    await db.delete(priceAdjustments).where(eq(priceAdjustments.id, id))
    this.setStatus(204)
  }
}
