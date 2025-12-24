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
import type { Currency, OrderType, PricingMode, SellOrderLimitMode } from '@kawakawa/types'
import { db, sellOrders, fioCommodities, fioLocations } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { hasPermission } from '../utils/permissionService.js'
import { calculateEffectivePriceWithFallback } from '../services/price-calculator.js'
import { enrichSellOrdersWithQuantities } from '@kawakawa/services/market'

// Sell order with calculated availability
interface SellOrderResponse {
  id: number
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  priceListCode: string | null // null = custom/fixed price, set = dynamic pricing from price list
  orderType: OrderType
  limitMode: SellOrderLimitMode
  limitQuantity: number | null
  fioQuantity: number
  availableQuantity: number
  activeReservationCount: number // count of pending/confirmed reservations
  reservedQuantity: number // sum of quantities in active reservations
  fulfilledQuantity: number // sum of quantities in fulfilled reservations
  remainingQuantity: number // availableQuantity - reservedQuantity - fulfilledQuantity
  fioUploadedAt: string | null // When seller's FIO inventory was last synced from game
  // Dynamic pricing fields
  pricingMode: PricingMode
  effectivePrice: number | null // Calculated price from price list (null if not available)
  isFallback: boolean // True if price came from price list's default location
  priceLocationId: string | null // The location the price was fetched from (when isFallback)
}

interface CreateSellOrderRequest {
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  priceListCode?: string | null // null or undefined = custom/fixed price, set = dynamic pricing
  orderType?: OrderType
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
}

interface UpdateSellOrderRequest {
  price?: number
  currency?: Currency
  priceListCode?: string | null // null = switch to custom pricing, string = switch to dynamic pricing
  orderType?: OrderType
  limitMode?: SellOrderLimitMode
  limitQuantity?: number | null
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

    // Get sell orders
    const orders = await db.select().from(sellOrders).where(eq(sellOrders.userId, userId))

    if (orders.length === 0) {
      return []
    }

    // Use centralized function to get quantity info with proper expiration logic
    const quantityMap = await enrichSellOrdersWithQuantities(
      orders.map(o => ({
        id: o.id,
        userId: o.userId,
        commodityTicker: o.commodityTicker,
        locationId: o.locationId,
        limitMode: o.limitMode,
        limitQuantity: o.limitQuantity,
      }))
    )

    return Promise.all(
      orders.map(async order => {
        const quantityInfo = quantityMap.get(order.id) ?? {
          fioQuantity: 0,
          availableQuantity: 0,
          reservedQuantity: 0,
          fulfilledQuantity: 0,
          remainingQuantity: 0,
          activeReservationCount: 0,
          fioUploadedAt: null,
        }

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
          price: parseFloat(order.price),
          currency: order.currency,
          priceListCode: order.priceListCode,
          orderType: order.orderType,
          limitMode: order.limitMode,
          limitQuantity: order.limitQuantity,
          fioQuantity: quantityInfo.fioQuantity,
          availableQuantity: quantityInfo.availableQuantity,
          activeReservationCount: quantityInfo.activeReservationCount,
          reservedQuantity: quantityInfo.reservedQuantity,
          fulfilledQuantity: quantityInfo.fulfilledQuantity,
          remainingQuantity: quantityInfo.remainingQuantity,
          fioUploadedAt: quantityInfo.fioUploadedAt?.toISOString() ?? null,
          pricingMode,
          effectivePrice,
          isFallback,
          priceLocationId,
        }
      })
    )
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

    // Use centralized function to get quantity info with proper expiration logic
    const quantityMap = await enrichSellOrdersWithQuantities([
      {
        id: order.id,
        userId: order.userId,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        limitMode: order.limitMode,
        limitQuantity: order.limitQuantity,
      },
    ])

    const quantityInfo = quantityMap.get(order.id) ?? {
      fioQuantity: 0,
      availableQuantity: 0,
      reservedQuantity: 0,
      fulfilledQuantity: 0,
      remainingQuantity: 0,
      activeReservationCount: 0,
      fioUploadedAt: null,
    }

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
      price: parseFloat(order.price),
      currency: order.currency,
      priceListCode: order.priceListCode,
      orderType: order.orderType,
      limitMode: order.limitMode,
      limitQuantity: order.limitQuantity,
      fioQuantity: quantityInfo.fioQuantity,
      availableQuantity: quantityInfo.availableQuantity,
      activeReservationCount: quantityInfo.activeReservationCount,
      reservedQuantity: quantityInfo.reservedQuantity,
      fulfilledQuantity: quantityInfo.fulfilledQuantity,
      remainingQuantity: quantityInfo.remainingQuantity,
      fioUploadedAt: quantityInfo.fioUploadedAt?.toISOString() ?? null,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
    }
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

    // Create sell order
    const [newOrder] = await db
      .insert(sellOrders)
      .values({
        userId,
        commodityTicker: body.commodityTicker,
        locationId: body.locationId,
        price: body.price.toString(),
        currency: body.currency,
        priceListCode,
        orderType,
        limitMode: body.limitMode ?? 'none',
        limitQuantity: body.limitQuantity ?? null,
      })
      .returning()

    this.setStatus(201)

    // Use centralized function to get quantity info (new order has no reservations)
    const quantityMap = await enrichSellOrdersWithQuantities([
      {
        id: newOrder.id,
        userId: newOrder.userId,
        commodityTicker: newOrder.commodityTicker,
        locationId: newOrder.locationId,
        limitMode: newOrder.limitMode,
        limitQuantity: newOrder.limitQuantity,
      },
    ])

    const quantityInfo = quantityMap.get(newOrder.id) ?? {
      fioQuantity: 0,
      availableQuantity: 0,
      reservedQuantity: 0,
      fulfilledQuantity: 0,
      remainingQuantity: 0,
      activeReservationCount: 0,
      fioUploadedAt: null,
    }

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
      price: parseFloat(newOrder.price),
      currency: newOrder.currency,
      priceListCode: newOrder.priceListCode,
      orderType: newOrder.orderType,
      limitMode: newOrder.limitMode,
      limitQuantity: newOrder.limitQuantity,
      fioQuantity: quantityInfo.fioQuantity,
      availableQuantity: quantityInfo.availableQuantity,
      activeReservationCount: quantityInfo.activeReservationCount,
      reservedQuantity: quantityInfo.reservedQuantity,
      fulfilledQuantity: quantityInfo.fulfilledQuantity,
      remainingQuantity: quantityInfo.remainingQuantity,
      fioUploadedAt: quantityInfo.fioUploadedAt?.toISOString() ?? null,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
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
    const updateData: Partial<typeof sellOrders.$inferInsert> = {
      updatedAt: new Date(),
    }
    if (body.price !== undefined) updateData.price = body.price.toString()
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.priceListCode !== undefined) updateData.priceListCode = body.priceListCode
    if (body.orderType !== undefined) updateData.orderType = body.orderType
    if (body.limitMode !== undefined) updateData.limitMode = body.limitMode
    if (body.limitQuantity !== undefined) updateData.limitQuantity = body.limitQuantity

    // Update
    const [updated] = await db
      .update(sellOrders)
      .set(updateData)
      .where(eq(sellOrders.id, id))
      .returning()

    // Use centralized function to get quantity info with proper expiration logic
    const quantityMap = await enrichSellOrdersWithQuantities([
      {
        id: updated.id,
        userId: updated.userId,
        commodityTicker: updated.commodityTicker,
        locationId: updated.locationId,
        limitMode: updated.limitMode,
        limitQuantity: updated.limitQuantity,
      },
    ])

    const quantityInfo = quantityMap.get(updated.id) ?? {
      fioQuantity: 0,
      availableQuantity: 0,
      reservedQuantity: 0,
      fulfilledQuantity: 0,
      remainingQuantity: 0,
      activeReservationCount: 0,
      fioUploadedAt: null,
    }

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
      price: parseFloat(updated.price),
      currency: updated.currency,
      priceListCode: updated.priceListCode,
      orderType: updated.orderType,
      limitMode: updated.limitMode,
      limitQuantity: updated.limitQuantity,
      fioQuantity: quantityInfo.fioQuantity,
      availableQuantity: quantityInfo.availableQuantity,
      activeReservationCount: quantityInfo.activeReservationCount,
      reservedQuantity: quantityInfo.reservedQuantity,
      fulfilledQuantity: quantityInfo.fulfilledQuantity,
      remainingQuantity: quantityInfo.remainingQuantity,
      fioUploadedAt: quantityInfo.fioUploadedAt?.toISOString() ?? null,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
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
