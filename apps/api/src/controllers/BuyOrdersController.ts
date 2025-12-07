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
import { db, buyOrders, fioCommodities, fioLocations, orderReservations } from '../db/index.js'
import { eq, and, inArray, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { hasPermission } from '../utils/permissionService.js'

interface BuyOrderResponse {
  id: number
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  orderType: OrderType
  activeReservationCount: number // count of pending/confirmed reservations
  reservedQuantity: number // sum of quantities in active reservations
  fulfilledQuantity: number // sum of quantities in fulfilled reservations
  remainingQuantity: number // quantity - reservedQuantity - fulfilledQuantity
}

interface CreateBuyOrderRequest {
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  orderType?: OrderType
}

interface UpdateBuyOrderRequest {
  quantity?: number
  price?: number
  currency?: Currency
  orderType?: OrderType
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

@Route('buy-orders')
@Tags('Buy Orders')
@Security('jwt')
export class BuyOrdersController extends Controller {
  /**
   * Get all buy orders for the current user
   */
  @Get()
  public async getBuyOrders(@Request() request: { user: JwtPayload }): Promise<BuyOrderResponse[]> {
    const userId = request.user.userId

    const orders = await db.select().from(buyOrders).where(eq(buyOrders.userId, userId))

    // Get reservation counts for all buy orders
    const orderIds = orders.map(o => o.id)
    const reservationMap = new Map<
      number,
      { count: number; quantity: number; fulfilledQuantity: number }
    >()

    if (orderIds.length > 0) {
      // Get active reservations (pending/confirmed) and fulfilled in one query
      const reservationStats = await db
        .select({
          buyOrderId: orderReservations.buyOrderId,
          count: sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed'))::int`,
          quantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed')), 0)::int`,
          fulfilledQuantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled'), 0)::int`,
        })
        .from(orderReservations)
        .where(inArray(orderReservations.buyOrderId, orderIds))
        .groupBy(orderReservations.buyOrderId)

      for (const stat of reservationStats) {
        if (stat.buyOrderId !== null) {
          reservationMap.set(stat.buyOrderId, {
            count: stat.count,
            quantity: stat.quantity,
            fulfilledQuantity: stat.fulfilledQuantity,
          })
        }
      }
    }

    return orders.map(order => {
      const reservationData = reservationMap.get(order.id) ?? {
        count: 0,
        quantity: 0,
        fulfilledQuantity: 0,
      }
      const remainingQuantity = Math.max(
        0,
        order.quantity - reservationData.quantity - reservationData.fulfilledQuantity
      )

      return {
        id: order.id,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        quantity: order.quantity,
        price: parseFloat(order.price),
        currency: order.currency,
        orderType: order.orderType,
        activeReservationCount: reservationData.count,
        reservedQuantity: reservationData.quantity,
        fulfilledQuantity: reservationData.fulfilledQuantity,
        remainingQuantity,
      }
    })
  }

  /**
   * Get a specific buy order
   */
  @Get('{id}')
  public async getBuyOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<BuyOrderResponse> {
    const userId = request.user.userId

    const [order] = await db
      .select()
      .from(buyOrders)
      .where(and(eq(buyOrders.id, id), eq(buyOrders.userId, userId)))

    if (!order) {
      this.setStatus(404)
      throw NotFound('Buy order not found')
    }

    // Get reservation counts
    const reservationData = await this.getReservationCounts(order.id)
    const remainingQuantity = Math.max(
      0,
      order.quantity - reservationData.quantity - reservationData.fulfilledQuantity
    )

    return {
      id: order.id,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
      quantity: order.quantity,
      price: parseFloat(order.price),
      currency: order.currency,
      orderType: order.orderType,
      activeReservationCount: reservationData.count,
      reservedQuantity: reservationData.quantity,
      fulfilledQuantity: reservationData.fulfilledQuantity,
      remainingQuantity,
    }
  }

  /**
   * Helper to get reservation counts for a buy order
   */
  private async getReservationCounts(
    buyOrderId: number
  ): Promise<{ count: number; quantity: number; fulfilledQuantity: number }> {
    const result = await db
      .select({
        count: sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed'))::int`,
        quantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed')), 0)::int`,
        fulfilledQuantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled'), 0)::int`,
      })
      .from(orderReservations)
      .where(eq(orderReservations.buyOrderId, buyOrderId))

    return result[0] ?? { count: 0, quantity: 0, fulfilledQuantity: 0 }
  }

  /**
   * Create a new buy order
   */
  @Post()
  @SuccessResponse('201', 'Created')
  public async createBuyOrder(
    @Body() body: CreateBuyOrderRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BuyOrderResponse> {
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

    // Validate quantity
    if (body.quantity <= 0) {
      this.setStatus(400)
      throw BadRequest('Quantity must be greater than 0')
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

    // Check for duplicate buy order (same commodity/location/orderType/currency)
    const [existing] = await db
      .select({ id: buyOrders.id })
      .from(buyOrders)
      .where(
        and(
          eq(buyOrders.userId, userId),
          eq(buyOrders.commodityTicker, body.commodityTicker),
          eq(buyOrders.locationId, body.locationId),
          eq(buyOrders.orderType, orderType),
          eq(buyOrders.currency, body.currency)
        )
      )

    if (existing) {
      this.setStatus(400)
      throw BadRequest(
        `Buy order already exists for ${body.commodityTicker} at ${body.locationId} (${getOrderTypeDisplay(orderType)}, ${body.currency}). Update the existing order instead.`
      )
    }

    // Create buy order
    const [newOrder] = await db
      .insert(buyOrders)
      .values({
        userId,
        commodityTicker: body.commodityTicker,
        locationId: body.locationId,
        quantity: body.quantity,
        price: body.price.toString(),
        currency: body.currency,
        orderType,
      })
      .returning()

    this.setStatus(201)

    return {
      id: newOrder.id,
      commodityTicker: newOrder.commodityTicker,
      locationId: newOrder.locationId,
      quantity: newOrder.quantity,
      price: parseFloat(newOrder.price),
      currency: newOrder.currency,
      orderType: newOrder.orderType,
      activeReservationCount: 0, // New order has no reservations
      reservedQuantity: 0,
      fulfilledQuantity: 0,
      remainingQuantity: newOrder.quantity,
    }
  }

  /**
   * Update a buy order
   */
  @Put('{id}')
  public async updateBuyOrder(
    @Path() id: number,
    @Body() body: UpdateBuyOrderRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<BuyOrderResponse> {
    const userId = request.user.userId
    const userRoles = request.user.roles

    // Verify order exists and belongs to user
    const [existing] = await db
      .select()
      .from(buyOrders)
      .where(and(eq(buyOrders.id, id), eq(buyOrders.userId, userId)))

    if (!existing) {
      this.setStatus(404)
      throw NotFound('Buy order not found')
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

    // Validate quantity if provided
    if (body.quantity !== undefined && body.quantity <= 0) {
      this.setStatus(400)
      throw BadRequest('Quantity must be greater than 0')
    }

    // Build update object
    const updateData: Partial<typeof buyOrders.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.quantity !== undefined) updateData.quantity = body.quantity
    if (body.price !== undefined) updateData.price = body.price.toString()
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.orderType !== undefined) updateData.orderType = body.orderType

    // Update
    const [updated] = await db
      .update(buyOrders)
      .set(updateData)
      .where(eq(buyOrders.id, id))
      .returning()

    // Get reservation counts
    const reservationData = await this.getReservationCounts(updated.id)
    const remainingQuantity = Math.max(
      0,
      updated.quantity - reservationData.quantity - reservationData.fulfilledQuantity
    )

    return {
      id: updated.id,
      commodityTicker: updated.commodityTicker,
      locationId: updated.locationId,
      quantity: updated.quantity,
      price: parseFloat(updated.price),
      currency: updated.currency,
      orderType: updated.orderType,
      activeReservationCount: reservationData.count,
      reservedQuantity: reservationData.quantity,
      fulfilledQuantity: reservationData.fulfilledQuantity,
      remainingQuantity,
    }
  }

  /**
   * Delete a buy order
   */
  @Delete('{id}')
  @SuccessResponse('204', 'Deleted')
  public async deleteBuyOrder(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    const [existing] = await db
      .select({ id: buyOrders.id })
      .from(buyOrders)
      .where(and(eq(buyOrders.id, id), eq(buyOrders.userId, userId)))

    if (!existing) {
      this.setStatus(404)
      throw NotFound('Buy order not found')
    }

    await db.delete(buyOrders).where(eq(buyOrders.id, id))
    this.setStatus(204)
  }
}
