import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import type { Currency } from '@kawakawa/types'
import {
  db,
  priceLists,
  prices,
  priceAdjustments,
  importConfigs,
  fioLocations,
} from '../db/index.js'
import { eq } from 'drizzle-orm'
import { NotFound, BadRequest, Conflict } from '../utils/errors.js'

export type PriceListType = 'fio' | 'custom'

export interface PriceListDefinition {
  code: string
  name: string
  description: string | null
  type: PriceListType
  currency: Currency
  defaultLocationId: string | null
  defaultLocationName: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  priceCount?: number
  importConfigCount?: number
}

interface CreatePriceListRequest {
  code: string
  name: string
  description?: string | null
  type: PriceListType
  currency: Currency
  defaultLocationId?: string | null
  isActive?: boolean
}

interface UpdatePriceListRequest {
  name?: string
  description?: string | null
  currency?: Currency
  defaultLocationId?: string | null
  isActive?: boolean
}

@Route('price-lists')
@Tags('Pricing')
export class PriceListsController extends Controller {
  /**
   * Get all price list definitions
   */
  @Get()
  public async getPriceLists(): Promise<PriceListDefinition[]> {
    const results = await db
      .select({
        code: priceLists.code,
        name: priceLists.name,
        description: priceLists.description,
        type: priceLists.type,
        currency: priceLists.currency,
        defaultLocationId: priceLists.defaultLocationId,
        defaultLocationName: fioLocations.name,
        isActive: priceLists.isActive,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(fioLocations, eq(priceLists.defaultLocationId, fioLocations.naturalId))
      .orderBy(priceLists.code)

    // Get counts for each price list
    const priceCountsResult = await db.select({ priceListCode: prices.priceListCode }).from(prices)

    const priceCounts = new Map<string, number>()
    for (const row of priceCountsResult) {
      priceCounts.set(row.priceListCode, (priceCounts.get(row.priceListCode) || 0) + 1)
    }

    const configCountsResult = await db
      .select({ priceListCode: importConfigs.priceListCode })
      .from(importConfigs)

    const configCounts = new Map<string, number>()
    for (const row of configCountsResult) {
      configCounts.set(row.priceListCode, (configCounts.get(row.priceListCode) || 0) + 1)
    }

    return results.map(r => ({
      ...r,
      priceCount: priceCounts.get(r.code) || 0,
      importConfigCount: configCounts.get(r.code) || 0,
    }))
  }

  /**
   * Get a specific price list definition
   * @param code The price list code
   */
  @Get('{code}')
  public async getPriceList(@Path() code: string): Promise<PriceListDefinition> {
    const results = await db
      .select({
        code: priceLists.code,
        name: priceLists.name,
        description: priceLists.description,
        type: priceLists.type,
        currency: priceLists.currency,
        defaultLocationId: priceLists.defaultLocationId,
        defaultLocationName: fioLocations.name,
        isActive: priceLists.isActive,
        createdAt: priceLists.createdAt,
        updatedAt: priceLists.updatedAt,
      })
      .from(priceLists)
      .leftJoin(fioLocations, eq(priceLists.defaultLocationId, fioLocations.naturalId))
      .where(eq(priceLists.code, code.toUpperCase()))
      .limit(1)

    if (results.length === 0) {
      throw NotFound(`Price list '${code.toUpperCase()}' not found`)
    }

    // Get price count
    const priceCountResult = await db
      .select({ id: prices.id })
      .from(prices)
      .where(eq(prices.priceListCode, code.toUpperCase()))

    // Get import config count
    const configCountResult = await db
      .select({ id: importConfigs.id })
      .from(importConfigs)
      .where(eq(importConfigs.priceListCode, code.toUpperCase()))

    return {
      ...results[0],
      priceCount: priceCountResult.length,
      importConfigCount: configCountResult.length,
    }
  }

  /**
   * Create a new price list
   * @param body The price list data
   */
  @Post()
  @Security('jwt', ['prices.manage'])
  @SuccessResponse('201', 'Created')
  public async createPriceList(@Body() body: CreatePriceListRequest): Promise<PriceListDefinition> {
    const code = body.code.toUpperCase()

    // Check if code already exists
    const existing = await db
      .select({ code: priceLists.code })
      .from(priceLists)
      .where(eq(priceLists.code, code))
      .limit(1)

    if (existing.length > 0) {
      throw Conflict(`Price list '${code}' already exists`)
    }

    // Validate location if provided
    if (body.defaultLocationId) {
      const locationExists = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, body.defaultLocationId.toUpperCase()))
        .limit(1)

      if (locationExists.length === 0) {
        throw BadRequest(`Location '${body.defaultLocationId}' not found`)
      }
    }

    await db.insert(priceLists).values({
      code,
      name: body.name,
      description: body.description ?? null,
      type: body.type,
      currency: body.currency,
      defaultLocationId: body.defaultLocationId?.toUpperCase() ?? null,
      isActive: body.isActive ?? true,
    })

    this.setStatus(201)
    return this.getPriceList(code)
  }

  /**
   * Update an existing price list
   * @param code The price list code
   * @param body The fields to update
   */
  @Put('{code}')
  @Security('jwt', ['prices.manage'])
  public async updatePriceList(
    @Path() code: string,
    @Body() body: UpdatePriceListRequest
  ): Promise<PriceListDefinition> {
    const upperCode = code.toUpperCase()

    // Check if price list exists
    const existing = await db
      .select({ code: priceLists.code, type: priceLists.type })
      .from(priceLists)
      .where(eq(priceLists.code, upperCode))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Price list '${upperCode}' not found`)
    }

    // Don't allow changing currency on FIO price lists (they have fixed currencies)
    if (existing[0].type === 'fio' && body.currency !== undefined) {
      throw BadRequest('Cannot change currency on FIO price lists')
    }

    // Validate location if provided
    if (body.defaultLocationId) {
      const locationExists = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, body.defaultLocationId.toUpperCase()))
        .limit(1)

      if (locationExists.length === 0) {
        throw BadRequest(`Location '${body.defaultLocationId}' not found`)
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.defaultLocationId !== undefined)
      updateData.defaultLocationId = body.defaultLocationId?.toUpperCase() ?? null
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    await db.update(priceLists).set(updateData).where(eq(priceLists.code, upperCode))

    return this.getPriceList(upperCode)
  }

  /**
   * Delete a price list and all associated data
   * @param code The price list code
   */
  @Delete('{code}')
  @Security('jwt', ['prices.manage'])
  @SuccessResponse('204', 'Deleted')
  public async deletePriceList(@Path() code: string): Promise<void> {
    const upperCode = code.toUpperCase()

    // Check if price list exists
    const existing = await db
      .select({ code: priceLists.code, type: priceLists.type })
      .from(priceLists)
      .where(eq(priceLists.code, upperCode))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Price list '${upperCode}' not found`)
    }

    // Don't allow deleting FIO price lists (they're managed by the system)
    if (existing[0].type === 'fio') {
      throw BadRequest('Cannot delete FIO price lists - they are system-managed')
    }

    // Delete associated prices
    await db.delete(prices).where(eq(prices.priceListCode, upperCode))

    // Delete associated adjustments
    await db.delete(priceAdjustments).where(eq(priceAdjustments.priceListCode, upperCode))

    // Import configs are deleted by cascade (FK has onDelete: cascade)

    // Delete the price list itself
    await db.delete(priceLists).where(eq(priceLists.code, upperCode))

    this.setStatus(204)
  }
}
