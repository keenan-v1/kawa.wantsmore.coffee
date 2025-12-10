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
import {
  db,
  priceAdjustments,
  fioCommodities,
  fioLocations,
  priceLists,
  users,
} from '../db/index.js'
import { eq, and, or, isNull, ilike } from 'drizzle-orm'
import { NotFound, BadRequest } from '../utils/errors.js'
import { AuthenticatedRequest } from '../middleware/auth.js'
import type { AdjustmentType } from '../services/price-calculator.js'

interface PriceAdjustmentResponse {
  id: number
  priceListCode: string | null
  commodityTicker: string | null
  commodityName: string | null
  locationId: string | null
  locationName: string | null
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
  // Backwards compatibility
  exchangeCode: string | null
}

interface CreatePriceAdjustmentRequest {
  priceListCode?: string | null
  commodityTicker?: string | null
  locationId?: string | null
  adjustmentType: AdjustmentType
  adjustmentValue: number
  priority?: number
  description?: string | null
  isActive?: boolean
  effectiveFrom?: string | null
  effectiveUntil?: string | null
}

interface UpdatePriceAdjustmentRequest {
  priceListCode?: string | null
  commodityTicker?: string | null
  locationId?: string | null
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
   * @param priceList Filter by price list code (exact match or NULL)
   * @param location Filter by location ID (exact match or NULL)
   * @param activeOnly Only return active adjustments
   */
  @Get()
  public async getAdjustments(
    @Query() priceList?: string,
    @Query() location?: string,
    @Query() activeOnly?: boolean
  ): Promise<PriceAdjustmentResponse[]> {
    const conditions = []

    if (priceList) {
      conditions.push(
        or(
          eq(priceAdjustments.priceListCode, priceList.toUpperCase()),
          isNull(priceAdjustments.priceListCode)
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
        priceListCode: priceAdjustments.priceListCode,
        commodityTicker: priceAdjustments.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceAdjustments.locationId,
        locationName: fioLocations.name,
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

    return results.map(r => ({
      ...r,
      // Backwards compatibility
      exchangeCode: r.priceListCode,
    }))
  }

  /**
   * Get adjustments that apply to a specific price list
   * @param priceListCode The price list code
   */
  @Get('price-list/{priceListCode}')
  public async getAdjustmentsByPriceList(
    @Path() priceListCode: string
  ): Promise<PriceAdjustmentResponse[]> {
    // Get adjustments that specifically target this price list OR apply globally
    const results = await db
      .select({
        id: priceAdjustments.id,
        priceListCode: priceAdjustments.priceListCode,
        commodityTicker: priceAdjustments.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceAdjustments.locationId,
        locationName: fioLocations.name,
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
          eq(priceAdjustments.priceListCode, priceListCode.toUpperCase()),
          isNull(priceAdjustments.priceListCode)
        )
      )
      .orderBy(priceAdjustments.priority, priceAdjustments.id)

    return results.map(r => ({
      ...r,
      exchangeCode: r.priceListCode,
    }))
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
        priceListCode: priceAdjustments.priceListCode,
        commodityTicker: priceAdjustments.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceAdjustments.locationId,
        locationName: fioLocations.name,
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

    return results.map(r => ({
      ...r,
      exchangeCode: r.priceListCode,
    }))
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
        priceListCode: priceAdjustments.priceListCode,
        commodityTicker: priceAdjustments.commodityTicker,
        commodityName: fioCommodities.name,
        locationId: priceAdjustments.locationId,
        locationName: fioLocations.name,
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

    return {
      ...results[0],
      exchangeCode: results[0].priceListCode,
    }
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
    const priceListCode = body.priceListCode?.toUpperCase() ?? null
    const commodityTicker = body.commodityTicker?.toUpperCase() ?? null
    let locationId: string | null = null

    // Validate price list if provided
    if (priceListCode) {
      const priceListExists = await db
        .select({ code: priceLists.code })
        .from(priceLists)
        .where(eq(priceLists.code, priceListCode))
        .limit(1)

      if (priceListExists.length === 0) {
        throw BadRequest(`Price list '${priceListCode}' not found`)
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

    // Validate location if provided (case-insensitive lookup)
    if (body.locationId) {
      const locationResult = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(ilike(fioLocations.naturalId, body.locationId))
        .limit(1)

      if (locationResult.length === 0) {
        throw BadRequest(`Location '${body.locationId}' not found`)
      }
      // Use the actual stored value from database
      locationId = locationResult[0].naturalId
    }

    // Insert the adjustment
    const [inserted] = await db
      .insert(priceAdjustments)
      .values({
        priceListCode,
        commodityTicker,
        locationId,
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

    // Validate price list if being updated to a specific value
    if (body.priceListCode !== undefined && body.priceListCode !== null) {
      const priceListCode = body.priceListCode.toUpperCase()
      const priceListExists = await db
        .select({ code: priceLists.code })
        .from(priceLists)
        .where(eq(priceLists.code, priceListCode))
        .limit(1)

      if (priceListExists.length === 0) {
        throw BadRequest(`Price list '${priceListCode}' not found`)
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

    // Validate location if being updated to a specific value (case-insensitive lookup)
    let resolvedLocationId: string | null | undefined = undefined
    if (body.locationId !== undefined && body.locationId !== null) {
      const locationResult = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(ilike(fioLocations.naturalId, body.locationId))
        .limit(1)

      if (locationResult.length === 0) {
        throw BadRequest(`Location '${body.locationId}' not found`)
      }
      // Use the actual stored value from database
      resolvedLocationId = locationResult[0].naturalId
    } else if (body.locationId === null) {
      resolvedLocationId = null
    }

    // Build update object
    const updateData: Partial<{
      priceListCode: string | null
      commodityTicker: string | null
      locationId: string | null
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

    if (body.priceListCode !== undefined) {
      updateData.priceListCode = body.priceListCode?.toUpperCase() ?? null
    }
    if (body.commodityTicker !== undefined) {
      updateData.commodityTicker = body.commodityTicker?.toUpperCase() ?? null
    }
    if (resolvedLocationId !== undefined) {
      updateData.locationId = resolvedLocationId
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
