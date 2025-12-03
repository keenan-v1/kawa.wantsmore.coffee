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
  Tags,
  Request,
  SuccessResponse,
} from 'tsoa'
import type { Currency } from '@kawakawa/types'
import { db, sellOrders, fioInventory, fioUserStorage, fioCommodities, fioLocations, roles } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { hasPermission } from '../utils/permissionService.js'

// Sell order limit modes
type SellOrderLimitMode = 'none' | 'max_sell' | 'reserve'

// Sell order with calculated availability
interface SellOrderResponse {
  id: number
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  limitMode: SellOrderLimitMode
  limitQuantity: number | null
  targetRoleId: string | null
  fioQuantity: number
  availableQuantity: number
}

interface CreateSellOrderRequest {
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
  targetRoleId?: string | null
}

interface UpdateSellOrderRequest {
  price?: number
  currency?: Currency
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
  targetRoleId?: string | null
}

/**
 * Calculate available quantity based on FIO inventory and limit settings
 */
function calculateAvailableQuantity(
  fioQuantity: number,
  limitMode: SellOrderLimitMode,
  limitQuantity: number | null
): number {
  switch (limitMode) {
    case 'none':
      return fioQuantity
    case 'max_sell':
      return Math.min(fioQuantity, limitQuantity ?? 0)
    case 'reserve':
      return Math.max(0, fioQuantity - (limitQuantity ?? 0))
    default:
      return fioQuantity
  }
}

@Route('sell-orders')
@Tags('Sell Orders')
@Security('jwt')
export class SellOrdersController extends Controller {
  /**
   * Get all sell orders for the current user
   */
  @Get()
  public async getSellOrders(
    @Request() request: { user: JwtPayload }
  ): Promise<SellOrderResponse[]> {
    const userId = request.user.userId

    // Get sell orders - we'll look up inventory separately due to the new schema
    const orders = await db
      .select()
      .from(sellOrders)
      .where(eq(sellOrders.userId, userId))

    // Get all user's inventory with location info for matching
    const inventory = await db
      .select({
        commodityTicker: fioInventory.commodityTicker,
        quantity: fioInventory.quantity,
        locationId: fioUserStorage.locationId,
      })
      .from(fioInventory)
      .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
      .where(eq(fioInventory.userId, userId))

    // Build a lookup map: "ticker:locationId" -> total quantity
    const inventoryMap = new Map<string, number>()
    for (const item of inventory) {
      if (item.locationId) {
        const key = `${item.commodityTicker}:${item.locationId}`
        inventoryMap.set(key, (inventoryMap.get(key) ?? 0) + item.quantity)
      }
    }

    return orders.map(order => {
      const key = `${order.commodityTicker}:${order.locationId}`
      const fioQuantity = inventoryMap.get(key) ?? 0

      return {
        id: order.id,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        price: parseFloat(order.price),
        currency: order.currency,
        limitMode: order.limitMode,
        limitQuantity: order.limitQuantity,
        targetRoleId: order.targetRoleId,
        fioQuantity,
        availableQuantity: calculateAvailableQuantity(
          fioQuantity,
          order.limitMode,
          order.limitQuantity
        ),
      }
    })
  }

  /**
   * Get a specific sell order
   */
  @Get('{id}')
  public async getSellOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<SellOrderResponse> {
    const userId = request.user.userId

    const [order] = await db
      .select()
      .from(sellOrders)
      .where(and(eq(sellOrders.id, id), eq(sellOrders.userId, userId)))

    if (!order) {
      this.setStatus(404)
      throw NotFound('Sell order not found')
    }

    // Get FIO inventory for this commodity/location
    const fioQuantity = await this.getInventoryQuantity(
      userId,
      order.commodityTicker,
      order.locationId
    )

    return {
      id: order.id,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
      price: parseFloat(order.price),
      currency: order.currency,
      limitMode: order.limitMode,
      limitQuantity: order.limitQuantity,
      targetRoleId: order.targetRoleId,
      fioQuantity,
      availableQuantity: calculateAvailableQuantity(
        fioQuantity,
        order.limitMode,
        order.limitQuantity
      ),
    }
  }

  /**
   * Helper to get inventory quantity for a commodity at a location
   */
  private async getInventoryQuantity(
    userId: number,
    commodityTicker: string,
    locationId: string
  ): Promise<number> {
    const items = await db
      .select({ quantity: fioInventory.quantity })
      .from(fioInventory)
      .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
      .where(
        and(
          eq(fioInventory.userId, userId),
          eq(fioInventory.commodityTicker, commodityTicker),
          eq(fioUserStorage.locationId, locationId)
        )
      )

    return items.reduce((sum, item) => sum + item.quantity, 0)
  }

  /**
   * Create a new sell order
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createSellOrder(
    @Body() body: CreateSellOrderRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SellOrderResponse> {
    const userId = request.user.userId
    const userRoles = request.user.roles

    // Check permission based on whether this is internal or external order
    const isExternal = body.targetRoleId !== null && body.targetRoleId !== undefined
    const requiredPermission = isExternal ? 'orders.post_external' : 'orders.post_internal'

    if (!await hasPermission(userRoles, requiredPermission)) {
      this.setStatus(403)
      throw Forbidden(`You do not have permission to create ${isExternal ? 'external' : 'internal'} orders`)
    }

    // Validate commodity exists
    const [commodity] = await db
      .select({ ticker: fioCommodities.ticker })
      .from(fioCommodities)
      .where(eq(fioCommodities.ticker, body.commodityTicker))

    if (!commodity) {
      this.setStatus(400)
      throw BadRequest(`Commodity ${body.commodityTicker} not found`)
    }

    // Validate location exists
    const [location] = await db
      .select({ naturalId: fioLocations.naturalId })
      .from(fioLocations)
      .where(eq(fioLocations.naturalId, body.locationId))

    if (!location) {
      this.setStatus(400)
      throw BadRequest(`Location ${body.locationId} not found`)
    }

    // Validate target role exists (if specified)
    if (body.targetRoleId) {
      const [targetRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.id, body.targetRoleId))

      if (!targetRole) {
        this.setStatus(400)
        throw BadRequest(`Target role ${body.targetRoleId} not found`)
      }
    }

    // Check for duplicate sell order (same commodity at same location with same target)
    const [existing] = await db
      .select({ id: sellOrders.id })
      .from(sellOrders)
      .where(
        and(
          eq(sellOrders.userId, userId),
          eq(sellOrders.commodityTicker, body.commodityTicker),
          eq(sellOrders.locationId, body.locationId)
        )
      )

    if (existing) {
      this.setStatus(400)
      throw BadRequest(`Sell order already exists for ${body.commodityTicker} at ${body.locationId}. Update the existing order instead.`)
    }

    // Create sell order
    const [newOrder] = await db
      .insert(sellOrders)
      .values({
        userId,
        commodityTicker: body.commodityTicker,
        locationId: body.locationId,
        price: body.price.toString(),
        currency: body.currency,
        limitMode: body.limitMode ?? 'none',
        limitQuantity: body.limitQuantity ?? null,
        targetRoleId: body.targetRoleId ?? null,
      })
      .returning()

    this.setStatus(201)

    // Get FIO inventory for this commodity/location
    const fioQuantity = await this.getInventoryQuantity(
      userId,
      body.commodityTicker,
      body.locationId
    )

    return {
      id: newOrder.id,
      commodityTicker: newOrder.commodityTicker,
      locationId: newOrder.locationId,
      price: parseFloat(newOrder.price),
      currency: newOrder.currency,
      limitMode: newOrder.limitMode,
      limitQuantity: newOrder.limitQuantity,
      targetRoleId: newOrder.targetRoleId,
      fioQuantity,
      availableQuantity: calculateAvailableQuantity(
        fioQuantity,
        newOrder.limitMode,
        newOrder.limitQuantity
      ),
    }
  }

  /**
   * Update a sell order
   */
  @Put('{id}')
  public async updateSellOrder(
    @Path() id: number,
    @Body() body: UpdateSellOrderRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<SellOrderResponse> {
    const userId = request.user.userId
    const userRoles = request.user.roles

    // Verify order exists and belongs to user
    const [existing] = await db
      .select()
      .from(sellOrders)
      .where(and(eq(sellOrders.id, id), eq(sellOrders.userId, userId)))

    if (!existing) {
      this.setStatus(404)
      throw NotFound('Sell order not found')
    }

    // Check permission if changing targetRoleId
    if (body.targetRoleId !== undefined) {
      const isExternal = body.targetRoleId !== null
      const requiredPermission = isExternal ? 'orders.post_external' : 'orders.post_internal'

      if (!await hasPermission(userRoles, requiredPermission)) {
        this.setStatus(403)
        throw Forbidden(`You do not have permission to change this order to ${isExternal ? 'external' : 'internal'}`)
      }

      // Validate target role exists (if specified)
      if (body.targetRoleId) {
        const [targetRole] = await db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.id, body.targetRoleId))

        if (!targetRole) {
          this.setStatus(400)
          throw BadRequest(`Target role ${body.targetRoleId} not found`)
        }
      }
    }

    // Build update object
    const updateData: Partial<typeof sellOrders.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.price !== undefined) updateData.price = body.price.toString()
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.limitMode !== undefined) updateData.limitMode = body.limitMode
    if (body.limitQuantity !== undefined) updateData.limitQuantity = body.limitQuantity
    if (body.targetRoleId !== undefined) updateData.targetRoleId = body.targetRoleId

    // Update
    const [updated] = await db
      .update(sellOrders)
      .set(updateData)
      .where(eq(sellOrders.id, id))
      .returning()

    // Get FIO inventory
    const fioQuantity = await this.getInventoryQuantity(
      userId,
      updated.commodityTicker,
      updated.locationId
    )

    return {
      id: updated.id,
      commodityTicker: updated.commodityTicker,
      locationId: updated.locationId,
      price: parseFloat(updated.price),
      currency: updated.currency,
      limitMode: updated.limitMode,
      limitQuantity: updated.limitQuantity,
      targetRoleId: updated.targetRoleId,
      fioQuantity,
      availableQuantity: calculateAvailableQuantity(
        fioQuantity,
        updated.limitMode,
        updated.limitQuantity
      ),
    }
  }

  /**
   * Delete a sell order
   */
  @Delete('{id}')
  @SuccessResponse('204', 'Deleted')
  public async deleteSellOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    const [existing] = await db
      .select({ id: sellOrders.id })
      .from(sellOrders)
      .where(and(eq(sellOrders.id, id), eq(sellOrders.userId, userId)))

    if (!existing) {
      this.setStatus(404)
      throw NotFound('Sell order not found')
    }

    await db.delete(sellOrders).where(eq(sellOrders.id, id))
    this.setStatus(204)
  }
}
