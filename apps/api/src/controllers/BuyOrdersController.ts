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
import type { Currency, OrderType, PricingMode } from '@kawakawa/types'
import { db, buyOrders, fioCommodities, fioLocations, orderReservations } from '../db/index.js'
import { eq, and, inArray, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { hasPermission } from '../utils/permissionService.js'
import { calculateEffectivePriceWithFallback } from '../services/price-calculator.js'

interface BuyOrderResponse {
  id: number
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  priceListCode: string | null // null = custom/fixed price, set = dynamic pricing from price list
  orderType: OrderType
  activeReservationCount: number // count of pending/confirmed reservations
  reservedQuantity: number // sum of quantities in active reservations
  fulfilledQuantity: number // sum of quantities in fulfilled reservations
  remainingQuantity: number // quantity - reservedQuantity - fulfilledQuantity
  // Dynamic pricing fields
  pricingMode: PricingMode
  effectivePrice: number | null // Calculated price from price list (null if not available)
  isFallback: boolean // True if price came from price list's default location
  priceLocationId: string | null // The location the price was fetched from (when isFallback)
}

interface CreateBuyOrderRequest {
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  priceListCode?: string | null // null or undefined = custom/fixed price, set = dynamic pricing
  orderType?: OrderType
}

interface UpdateBuyOrderRequest {
  quantity?: number
  price?: number
  currency?: Currency
  priceListCode?: string | null // null = switch to custom pricing, string = switch to dynamic pricing
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

    return Promise.all(
      orders.map(async order => {
        const reservationData = reservationMap.get(order.id) ?? {
          count: 0,
          quantity: 0,
          fulfilledQuantity: 0,
        }
        const remainingQuantity = Math.max(
          0,
          order.quantity - reservationData.quantity - reservationData.fulfilledQuantity
        )

        // Calculate effective price for dynamic pricing orders
        const pricingMode: PricingMode = order.priceListCode ? 'dynamic' : 'fixed'
        let effectivePrice: number | null = null
        let isFallback = false
        let priceLocationId: string | null = null

        if (order.priceListCode) {
          const priceResult = await calculateEffectivePriceWithFallback(
            order.priceListCode,
            order.commodityTicker,
            order.locationId,
            order.currency
          )
          if (priceResult) {
            effectivePrice = priceResult.finalPrice
            isFallback = priceResult.isFallback ?? false
            priceLocationId = priceResult.isFallback ? priceResult.locationId : null
          }
        }

        return {
          id: order.id,
          commodityTicker: order.commodityTicker,
          locationId: order.locationId,
          quantity: order.quantity,
          price: parseFloat(order.price),
          currency: order.currency,
          priceListCode: order.priceListCode,
          orderType: order.orderType,
          activeReservationCount: reservationData.count,
          reservedQuantity: reservationData.quantity,
          fulfilledQuantity: reservationData.fulfilledQuantity,
          remainingQuantity,
          pricingMode,
          effectivePrice,
          isFallback,
          priceLocationId,
        }
      })
    )
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

    // Calculate effective price for dynamic pricing orders
    const pricingMode: PricingMode = order.priceListCode ? 'dynamic' : 'fixed'
    let effectivePrice: number | null = null
    let isFallback = false
    let priceLocationId: string | null = null

    if (order.priceListCode) {
      const priceResult = await calculateEffectivePriceWithFallback(
        order.priceListCode,
        order.commodityTicker,
        order.locationId,
        order.currency
      )
      if (priceResult) {
        effectivePrice = priceResult.finalPrice
        isFallback = priceResult.isFallback ?? false
        priceLocationId = priceResult.isFallback ? priceResult.locationId : null
      }
    }

    return {
      id: order.id,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
      quantity: order.quantity,
      price: parseFloat(order.price),
      currency: order.currency,
      priceListCode: order.priceListCode,
      orderType: order.orderType,
      activeReservationCount: reservationData.count,
      reservedQuantity: reservationData.quantity,
      fulfilledQuantity: reservationData.fulfilledQuantity,
      remainingQuantity,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
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

    // Validate price based on pricing mode
    const priceListCode = body.priceListCode ?? null
    if (priceListCode) {
      // Dynamic pricing: price must be 0
      if (body.price !== 0) {
        this.setStatus(400)
        throw BadRequest('Price must be 0 when using a price list for dynamic pricing')
      }
    } else {
      // Custom pricing: price must be > 0
      if (body.price <= 0) {
        this.setStatus(400)
        throw BadRequest('Price must be greater than 0 for custom pricing')
      }
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
        priceListCode,
        orderType,
      })
      .returning()

    this.setStatus(201)

    // Calculate effective price for dynamic pricing orders
    const pricingMode: PricingMode = newOrder.priceListCode ? 'dynamic' : 'fixed'
    let effectivePrice: number | null = null
    let isFallback = false
    let priceLocationId: string | null = null

    if (newOrder.priceListCode) {
      const priceResult = await calculateEffectivePriceWithFallback(
        newOrder.priceListCode,
        newOrder.commodityTicker,
        newOrder.locationId,
        newOrder.currency
      )
      if (priceResult) {
        effectivePrice = priceResult.finalPrice
        isFallback = priceResult.isFallback ?? false
        priceLocationId = priceResult.isFallback ? priceResult.locationId : null
      }
    }

    return {
      id: newOrder.id,
      commodityTicker: newOrder.commodityTicker,
      locationId: newOrder.locationId,
      quantity: newOrder.quantity,
      price: parseFloat(newOrder.price),
      currency: newOrder.currency,
      priceListCode: newOrder.priceListCode,
      orderType: newOrder.orderType,
      activeReservationCount: 0, // New order has no reservations
      reservedQuantity: 0,
      fulfilledQuantity: 0,
      remainingQuantity: newOrder.quantity,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
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

    // Determine final priceListCode (use existing if not provided)
    const finalPriceListCode =
      body.priceListCode !== undefined ? body.priceListCode : existing.priceListCode

    // Validate price based on pricing mode if price is being updated
    if (body.price !== undefined) {
      if (finalPriceListCode) {
        // Dynamic pricing: price must be 0
        if (body.price !== 0) {
          this.setStatus(400)
          throw BadRequest('Price must be 0 when using a price list for dynamic pricing')
        }
      } else {
        // Custom pricing: price must be > 0
        if (body.price <= 0) {
          this.setStatus(400)
          throw BadRequest('Price must be greater than 0 for custom pricing')
        }
      }
    }

    // Build update object
    const updateData: Partial<typeof buyOrders.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.quantity !== undefined) updateData.quantity = body.quantity
    if (body.price !== undefined) updateData.price = body.price.toString()
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.priceListCode !== undefined) updateData.priceListCode = body.priceListCode
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

    // Calculate effective price for dynamic pricing orders
    const pricingMode: PricingMode = updated.priceListCode ? 'dynamic' : 'fixed'
    let effectivePrice: number | null = null
    let isFallback = false
    let priceLocationId: string | null = null

    if (updated.priceListCode) {
      const priceResult = await calculateEffectivePriceWithFallback(
        updated.priceListCode,
        updated.commodityTicker,
        updated.locationId,
        updated.currency
      )
      if (priceResult) {
        effectivePrice = priceResult.finalPrice
        isFallback = priceResult.isFallback ?? false
        priceLocationId = priceResult.isFallback ? priceResult.locationId : null
      }
    }

    return {
      id: updated.id,
      commodityTicker: updated.commodityTicker,
      locationId: updated.locationId,
      quantity: updated.quantity,
      price: parseFloat(updated.price),
      currency: updated.currency,
      priceListCode: updated.priceListCode,
      orderType: updated.orderType,
      activeReservationCount: reservationData.count,
      reservedQuantity: reservationData.quantity,
      fulfilledQuantity: reservationData.fulfilledQuantity,
      remainingQuantity,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
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
