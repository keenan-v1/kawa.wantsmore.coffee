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
import { db, fioExchanges, fioLocations } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { NotFound, BadRequest, Conflict } from '../utils/errors.js'

interface FioExchangeResponse {
  code: string
  name: string
  locationId: string | null
  locationName: string | null
  currency: Currency
  createdAt: Date
}

interface CreateFioExchangeRequest {
  code: string
  name: string
  locationId?: string | null
  currency: Currency
}

interface UpdateFioExchangeRequest {
  name?: string
  locationId?: string | null
  currency?: Currency
}

@Route('fio-exchanges')
@Tags('Pricing')
export class FioExchangesController extends Controller {
  /**
   * Get all FIO exchanges
   * Returns all exchange codes with their location mappings
   */
  @Get()
  public async getFioExchanges(): Promise<FioExchangeResponse[]> {
    const results = await db
      .select({
        code: fioExchanges.code,
        name: fioExchanges.name,
        locationId: fioExchanges.locationId,
        locationName: fioLocations.name,
        currency: fioExchanges.currency,
        createdAt: fioExchanges.createdAt,
      })
      .from(fioExchanges)
      .leftJoin(fioLocations, eq(fioExchanges.locationId, fioLocations.naturalId))
      .orderBy(fioExchanges.code)

    return results.map(r => ({
      code: r.code,
      name: r.name,
      locationId: r.locationId,
      locationName: r.locationName,
      currency: r.currency,
      createdAt: r.createdAt,
    }))
  }

  /**
   * Get a specific FIO exchange by code
   * @param code The exchange code (e.g., 'CI1', 'KAWA')
   */
  @Get('{code}')
  public async getFioExchange(@Path() code: string): Promise<FioExchangeResponse> {
    const result = await db
      .select({
        code: fioExchanges.code,
        name: fioExchanges.name,
        locationId: fioExchanges.locationId,
        locationName: fioLocations.name,
        currency: fioExchanges.currency,
        createdAt: fioExchanges.createdAt,
      })
      .from(fioExchanges)
      .leftJoin(fioLocations, eq(fioExchanges.locationId, fioLocations.naturalId))
      .where(eq(fioExchanges.code, code.toUpperCase()))
      .limit(1)

    if (result.length === 0) {
      throw NotFound(`Exchange '${code}' not found`)
    }

    const r = result[0]
    return {
      code: r.code,
      name: r.name,
      locationId: r.locationId,
      locationName: r.locationName,
      currency: r.currency,
      createdAt: r.createdAt,
    }
  }

  /**
   * Create a new FIO exchange
   * @param body The exchange data
   */
  @Post()
  @Security('jwt', ['admin.manage_roles']) // Reusing admin permission for now
  @SuccessResponse('201', 'Created')
  public async createFioExchange(
    @Body() body: CreateFioExchangeRequest
  ): Promise<FioExchangeResponse> {
    const code = body.code.toUpperCase()

    // Check if exchange already exists
    const existing = await db
      .select({ code: fioExchanges.code })
      .from(fioExchanges)
      .where(eq(fioExchanges.code, code))
      .limit(1)

    if (existing.length > 0) {
      throw Conflict(`Exchange '${code}' already exists`)
    }

    // Validate location if provided
    if (body.locationId) {
      const location = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, body.locationId))
        .limit(1)

      if (location.length === 0) {
        throw BadRequest(`Location '${body.locationId}' not found`)
      }
    }

    // Insert the exchange
    await db.insert(fioExchanges).values({
      code,
      name: body.name,
      locationId: body.locationId ?? null,
      currency: body.currency,
    })

    this.setStatus(201)

    // Fetch and return the created exchange with location name
    return this.getFioExchange(code)
  }

  /**
   * Update an existing FIO exchange
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

    // Check if exchange exists
    const existing = await db
      .select({ code: fioExchanges.code })
      .from(fioExchanges)
      .where(eq(fioExchanges.code, upperCode))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Exchange '${code}' not found`)
    }

    // Validate location if being updated
    if (body.locationId !== undefined && body.locationId !== null) {
      const location = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, body.locationId))
        .limit(1)

      if (location.length === 0) {
        throw BadRequest(`Location '${body.locationId}' not found`)
      }
    }

    // Build update object
    const updateData: Partial<typeof fioExchanges.$inferInsert> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.locationId !== undefined) updateData.locationId = body.locationId
    if (body.currency !== undefined) updateData.currency = body.currency

    if (Object.keys(updateData).length > 0) {
      await db.update(fioExchanges).set(updateData).where(eq(fioExchanges.code, upperCode))
    }

    return this.getFioExchange(upperCode)
  }

  /**
   * Delete an FIO exchange
   * @param code The exchange code to delete
   */
  @Delete('{code}')
  @Security('jwt', ['admin.manage_roles'])
  @SuccessResponse('204', 'Deleted')
  public async deleteFioExchange(@Path() code: string): Promise<void> {
    const upperCode = code.toUpperCase()

    // Check if exchange exists
    const existing = await db
      .select({ code: fioExchanges.code })
      .from(fioExchanges)
      .where(eq(fioExchanges.code, upperCode))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Exchange '${code}' not found`)
    }

    // Prevent deleting built-in exchanges
    const builtInExchanges = ['CI1', 'NC1', 'IC1', 'AI1', 'KAWA']
    if (builtInExchanges.includes(upperCode)) {
      throw BadRequest(`Cannot delete built-in exchange '${upperCode}'`)
    }

    await db.delete(fioExchanges).where(eq(fioExchanges.code, upperCode))
    this.setStatus(204)
  }
}
