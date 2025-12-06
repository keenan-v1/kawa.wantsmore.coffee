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
import type { Currency, OrderType } from '@kawakawa/types'
import {
  db,
  sellOrders,
  fioInventory,
  fioUserStorage,
  fioCommodities,
  fioLocations,
  orderReservations,
} from '../db/index.js'
import { eq, and, inArray, or, sql } from 'drizzle-orm'
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
  orderType: OrderType
  limitMode: SellOrderLimitMode
  limitQuantity: number | null
  fioQuantity: number
  availableQuantity: number
  activeReservationCount: number // count of pending/confirmed reservations
  reservedQuantity: number // sum of quantities in active reservations
  remainingQuantity: number // availableQuantity - reservedQuantity
}

interface CreateSellOrderRequest {
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  orderType?: OrderType
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
}

interface UpdateSellOrderRequest {
  price?: number
  currency?: Currency
  orderType?: OrderType
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
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

/**
 * Get permission name for order type
 */
function getPermissionForOrderType(orderType: OrderType): string {
  return orderType === 'partner' ? 'orders.post_partner' : 'orders.post_internal'
}

/**
 * Get display name for order type
 */
function getOrderTypeDisplay(orderType: OrderType): string {
  return orderType === 'partner' ? 'partner' : 'internal'
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
    const orders = await db.select().from(sellOrders).where(eq(sellOrders.userId, userId))

    // Get all user's inventory with location info for matching
    const inventory = await db
      .select({
        commodityTicker: fioInventory.commodityTicker,
        quantity: fioInventory.quantity,
        locationId: fioUserStorage.locationId,
      })
      .from(fioInventory)
      .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
      .where(eq(fioUserStorage.userId, userId))

    // Build a lookup map: "ticker:locationId" -> total quantity
    const inventoryMap = new Map<string, number>()
    for (const item of inventory) {
      if (item.locationId) {
        const key = `${item.commodityTicker}:${item.locationId}`
        inventoryMap.set(key, (inventoryMap.get(key) ?? 0) + item.quantity)
      }
    }

    // Get reservation counts for all sell orders
    const orderIds = orders.map(o => o.id)
    const reservationMap = new Map<number, { count: number; quantity: number }>()

    if (orderIds.length > 0) {
      const reservationStats = await db
        .select({
          sellOrderId: orderReservations.sellOrderId,
          count: sql<number>`count(*)::int`,
          quantity: sql<number>`coalesce(sum(${orderReservations.quantity}), 0)::int`,
        })
        .from(orderReservations)
        .where(
          and(
            inArray(orderReservations.sellOrderId, orderIds),
            or(eq(orderReservations.status, 'pending'), eq(orderReservations.status, 'confirmed'))
          )
        )
        .groupBy(orderReservations.sellOrderId)

      for (const stat of reservationStats) {
        reservationMap.set(stat.sellOrderId, { count: stat.count, quantity: stat.quantity })
      }
    }

    return orders.map(order => {
      const key = `${order.commodityTicker}:${order.locationId}`
      const fioQuantity = inventoryMap.get(key) ?? 0
      const availableQuantity = calculateAvailableQuantity(
        fioQuantity,
        order.limitMode,
        order.limitQuantity
      )
      const reservationData = reservationMap.get(order.id) ?? { count: 0, quantity: 0 }
      const remainingQuantity = Math.max(0, availableQuantity - reservationData.quantity)

      return {
        id: order.id,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        price: parseFloat(order.price),
        currency: order.currency,
        orderType: order.orderType,
        limitMode: order.limitMode,
        limitQuantity: order.limitQuantity,
        fioQuantity,
        availableQuantity,
        activeReservationCount: reservationData.count,
        reservedQuantity: reservationData.quantity,
        remainingQuantity,
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

    const availableQuantity = calculateAvailableQuantity(
      fioQuantity,
      order.limitMode,
      order.limitQuantity
    )

    // Get reservation counts
    const reservationData = await this.getReservationCounts(order.id)
    const remainingQuantity = Math.max(0, availableQuantity - reservationData.quantity)

    return {
      id: order.id,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
      price: parseFloat(order.price),
      currency: order.currency,
      orderType: order.orderType,
      limitMode: order.limitMode,
      limitQuantity: order.limitQuantity,
      fioQuantity,
      availableQuantity,
      activeReservationCount: reservationData.count,
      reservedQuantity: reservationData.quantity,
      remainingQuantity,
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
          eq(fioUserStorage.userId, userId),
          eq(fioInventory.commodityTicker, commodityTicker),
          eq(fioUserStorage.locationId, locationId)
        )
      )

    return items.reduce((sum, item) => sum + item.quantity, 0)
  }

  /**
   * Helper to get reservation counts for a sell order
   */
  private async getReservationCounts(
    sellOrderId: number
  ): Promise<{ count: number; quantity: number }> {
    const result = await db
      .select({
        count: sql<number>`count(*)::int`,
        quantity: sql<number>`coalesce(sum(${orderReservations.quantity}), 0)::int`,
      })
      .from(orderReservations)
      .where(
        and(
          eq(orderReservations.sellOrderId, sellOrderId),
          or(eq(orderReservations.status, 'pending'), eq(orderReservations.status, 'confirmed'))
        )
      )

    return result[0] ?? { count: 0, quantity: 0 }
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
    const orderType = body.orderType ?? 'internal'

    // Check permission based on order type
    const requiredPermission = getPermissionForOrderType(orderType)

    if (!(await hasPermission(userRoles, requiredPermission))) {
      this.setStatus(403)
      throw Forbidden(
        `You do not have permission to create ${getOrderTypeDisplay(orderType)} orders`
      )
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

    // Check for duplicate sell order (same commodity/location/orderType/currency)
    const [existing] = await db
      .select({ id: sellOrders.id })
      .from(sellOrders)
      .where(
        and(
          eq(sellOrders.userId, userId),
          eq(sellOrders.commodityTicker, body.commodityTicker),
          eq(sellOrders.locationId, body.locationId),
          eq(sellOrders.orderType, orderType),
          eq(sellOrders.currency, body.currency)
        )
      )

    if (existing) {
      this.setStatus(400)
      throw BadRequest(
        `Sell order already exists for ${body.commodityTicker} at ${body.locationId} (${getOrderTypeDisplay(orderType)}, ${body.currency}). Update the existing order instead.`
      )
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
        orderType,
        limitMode: body.limitMode ?? 'none',
        limitQuantity: body.limitQuantity ?? null,
      })
      .returning()

    this.setStatus(201)

    // Get FIO inventory for this commodity/location
    const fioQuantity = await this.getInventoryQuantity(
      userId,
      body.commodityTicker,
      body.locationId
    )

    const availableQuantity = calculateAvailableQuantity(
      fioQuantity,
      newOrder.limitMode,
      newOrder.limitQuantity
    )

    return {
      id: newOrder.id,
      commodityTicker: newOrder.commodityTicker,
      locationId: newOrder.locationId,
      price: parseFloat(newOrder.price),
      currency: newOrder.currency,
      orderType: newOrder.orderType,
      limitMode: newOrder.limitMode,
      limitQuantity: newOrder.limitQuantity,
      fioQuantity,
      availableQuantity,
      activeReservationCount: 0, // New order has no reservations
      reservedQuantity: 0,
      remainingQuantity: availableQuantity,
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

    // Check permission if changing orderType
    if (body.orderType !== undefined && body.orderType !== existing.orderType) {
      const requiredPermission = getPermissionForOrderType(body.orderType)

      if (!(await hasPermission(userRoles, requiredPermission))) {
        this.setStatus(403)
        throw Forbidden(
          `You do not have permission to change this order to ${getOrderTypeDisplay(body.orderType)}`
        )
      }
    }

    // Build update object
    const updateData: Partial<typeof sellOrders.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.price !== undefined) updateData.price = body.price.toString()
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.orderType !== undefined) updateData.orderType = body.orderType
    if (body.limitMode !== undefined) updateData.limitMode = body.limitMode
    if (body.limitQuantity !== undefined) updateData.limitQuantity = body.limitQuantity

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

    const availableQuantity = calculateAvailableQuantity(
      fioQuantity,
      updated.limitMode,
      updated.limitQuantity
    )

    // Get reservation counts
    const reservationData = await this.getReservationCounts(updated.id)
    const remainingQuantity = Math.max(0, availableQuantity - reservationData.quantity)

    return {
      id: updated.id,
      commodityTicker: updated.commodityTicker,
      locationId: updated.locationId,
      price: parseFloat(updated.price),
      currency: updated.currency,
      orderType: updated.orderType,
      limitMode: updated.limitMode,
      limitQuantity: updated.limitQuantity,
      fioQuantity,
      availableQuantity,
      activeReservationCount: reservationData.count,
      reservedQuantity: reservationData.quantity,
      remainingQuantity,
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
