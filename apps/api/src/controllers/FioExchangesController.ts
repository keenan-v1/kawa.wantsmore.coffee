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
import { db, priceLists, fioLocations } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { NotFound, BadRequest, Conflict } from '../utils/errors.js'
import type { PriceListType } from './PriceListsController.js'

export interface FioExchangeResponse {
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
  // Backwards compatibility - alias for defaultLocationId
  locationId: string | null
}

interface CreateFioExchangeRequest {
  code: string
  name: string
  description?: string | null
  type?: PriceListType // Defaults to 'custom'
  currency: Currency
  defaultLocationId?: string | null
}

interface UpdateFioExchangeRequest {
  name?: string
  description?: string | null
  currency?: Currency
  defaultLocationId?: string | null
  isActive?: boolean
}

@Route('fio-exchanges')
@Tags('Pricing')
export class FioExchangesController extends Controller {
  /**
   * Get all price lists (exchanges)
   * Returns all exchange codes with their location mappings
   */
  @Get()
  public async getFioExchanges(): Promise<FioExchangeResponse[]> {
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

    return results.map(r => ({
      code: r.code,
      name: r.name,
      description: r.description,
      type: r.type,
      currency: r.currency,
      defaultLocationId: r.defaultLocationId,
      defaultLocationName: r.defaultLocationName,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // Backwards compatibility
      locationId: r.defaultLocationId,
    }))
  }

  /**
   * Get a specific price list by code
   * @param code The exchange code (e.g., 'CI1', 'KAWA')
   */
  @Get('{code}')
  public async getFioExchange(@Path() code: string): Promise<FioExchangeResponse> {
    const result = await db
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

    if (result.length === 0) {
      throw NotFound(`Exchange '${code}' not found`)
    }

    const r = result[0]
    return {
      code: r.code,
      name: r.name,
      description: r.description,
      type: r.type,
      currency: r.currency,
      defaultLocationId: r.defaultLocationId,
      defaultLocationName: r.defaultLocationName,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      locationId: r.defaultLocationId,
    }
  }

  /**
   * Create a new price list (exchange)
   * @param body The price list data
   */
  @Post()
  @Security('jwt', ['admin.manage_roles']) // Reusing admin permission for now
  @SuccessResponse('201', 'Created')
  public async createFioExchange(
    @Body() body: CreateFioExchangeRequest
  ): Promise<FioExchangeResponse> {
    const code = body.code.toUpperCase()

    // Check if price list already exists
    const existing = await db
      .select({ code: priceLists.code })
      .from(priceLists)
      .where(eq(priceLists.code, code))
      .limit(1)

    if (existing.length > 0) {
      throw Conflict(`Exchange '${code}' already exists`)
    }

    // Validate location if provided
    if (body.defaultLocationId) {
      const location = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, body.defaultLocationId))
        .limit(1)

      if (location.length === 0) {
        throw BadRequest(`Location '${body.defaultLocationId}' not found`)
      }
    }

    // Insert the price list
    await db.insert(priceLists).values({
      code,
      name: body.name,
      description: body.description ?? null,
      type: body.type ?? 'custom',
      currency: body.currency,
      defaultLocationId: body.defaultLocationId ?? null,
      isActive: true,
    })

    this.setStatus(201)

    // Fetch and return the created price list with location name
    return this.getFioExchange(code)
  }

  /**
   * Update an existing price list
   * @param code The exchange code to update
   * @param body The fields to update
   */
  @Put('{code}')
  @Security('jwt', ['admin.manage_roles'])
  public async updateFioExchange(
    @Path() code: string,
    @Body() body: UpdateFioExchangeRequest
  ): Promise<FioExchangeResponse> {
    const upperCode = code.toUpperCase()

    // Check if price list exists
    const existing = await db
      .select({ code: priceLists.code, type: priceLists.type })
      .from(priceLists)
      .where(eq(priceLists.code, upperCode))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Exchange '${code}' not found`)
    }

    // Prevent modifying FIO exchanges (except isActive)
    if (existing[0].type === 'fio') {
      const allowedFields = ['isActive']
      const requestedFields = Object.keys(body)
      const disallowedFields = requestedFields.filter(f => !allowedFields.includes(f))
      if (disallowedFields.length > 0) {
        throw BadRequest(`Cannot modify FIO exchange fields: ${disallowedFields.join(', ')}`)
      }
    }

    // Validate location if being updated
    if (body.defaultLocationId !== undefined && body.defaultLocationId !== null) {
      const location = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, body.defaultLocationId))
        .limit(1)

      if (location.length === 0) {
        throw BadRequest(`Location '${body.defaultLocationId}' not found`)
      }
    }

    // Build update object
    const updateData: Partial<typeof priceLists.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.defaultLocationId !== undefined) updateData.defaultLocationId = body.defaultLocationId
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.isActive !== undefined) updateData.isActive = body.isActive

    await db.update(priceLists).set(updateData).where(eq(priceLists.code, upperCode))

    return this.getFioExchange(upperCode)
  }

  /**
   * Delete a price list
   * @param code The exchange code to delete
   */
  @Delete('{code}')
  @Security('jwt', ['admin.manage_roles'])
  @SuccessResponse('204', 'Deleted')
  public async deleteFioExchange(@Path() code: string): Promise<void> {
    const upperCode = code.toUpperCase()

    // Check if price list exists
    const existing = await db
      .select({ code: priceLists.code, type: priceLists.type })
      .from(priceLists)
      .where(eq(priceLists.code, upperCode))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Exchange '${code}' not found`)
    }

    // Prevent deleting FIO exchanges
    if (existing[0].type === 'fio') {
      throw BadRequest(`Cannot delete FIO exchange '${upperCode}'`)
    }

    await db.delete(priceLists).where(eq(priceLists.code, upperCode))
    this.setStatus(204)
  }
}
