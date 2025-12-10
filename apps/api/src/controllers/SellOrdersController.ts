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
import {
  db,
  sellOrders,
  fioInventory,
  fioUserStorage,
  fioCommodities,
  fioLocations,
  orderReservations,
} from '../db/index.js'
import { eq, and, inArray, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { hasPermission } from '../utils/permissionService.js'
import { calculateEffectivePriceWithFallback } from '../services/price-calculator.js'

// Sell order limit modes
type SellOrderLimitMode = 'none' | 'max_sell' | 'reserve'

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

    // Get all user's inventory with location info and sync timestamps
    const inventory = await db
      .select({
        commodityTicker: fioInventory.commodityTicker,
        quantity: fioInventory.quantity,
        locationId: fioUserStorage.locationId,
        lastSyncedAt: fioUserStorage.lastSyncedAt,
        fioUploadedAt: fioUserStorage.fioUploadedAt,
      })
      .from(fioInventory)
      .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
      .where(eq(fioUserStorage.userId, userId))

    // Build lookup maps:
    // - inventoryMap: "ticker:locationId" -> total quantity
    // - syncTimeMap: locationId -> most recent lastSyncedAt
    // - fioUploadedAtMap: locationId -> most recent fioUploadedAt
    const inventoryMap = new Map<string, number>()
    const syncTimeMap = new Map<string, Date>()
    const fioUploadedAtMap = new Map<string, Date>()
    for (const item of inventory) {
      if (item.locationId) {
        const key = `${item.commodityTicker}:${item.locationId}`
        inventoryMap.set(key, (inventoryMap.get(key) ?? 0) + item.quantity)

        // Track the most recent sync time per location
        const existingSync = syncTimeMap.get(item.locationId)
        if (!existingSync || item.lastSyncedAt > existingSync) {
          syncTimeMap.set(item.locationId, item.lastSyncedAt)
        }

        // Track the most recent FIO upload time per location
        if (item.fioUploadedAt) {
          const existingUpload = fioUploadedAtMap.get(item.locationId)
          if (!existingUpload || item.fioUploadedAt > existingUpload) {
            fioUploadedAtMap.set(item.locationId, item.fioUploadedAt)
          }
        }
      }
    }

    // Get reservation counts for all sell orders
    // For FIO-backed orders (none/reserve), only count fulfilled reservations
    // that occurred AFTER the last FIO sync (otherwise FIO already reflects it)
    const orderIds = orders.map(o => o.id)
    const reservationMap = new Map<
      number,
      { count: number; quantity: number; fulfilledQuantity: number }
    >()

    if (orderIds.length > 0) {
      // Get active reservations (pending/confirmed) and all fulfilled with timestamps
      const reservationStats = await db
        .select({
          sellOrderId: orderReservations.sellOrderId,
          count: sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed'))::int`,
          quantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed')), 0)::int`,
          // For fulfilled, we need to check per-order whether to count based on limit mode
          // For max_sell: always count all fulfilled
          // For none/reserve: only count fulfilled where reservation.updatedAt > fioStorage.lastSyncedAt
          fulfilledQuantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled'), 0)::int`,
        })
        .from(orderReservations)
        .where(inArray(orderReservations.sellOrderId, orderIds))
        .groupBy(orderReservations.sellOrderId)

      // For FIO-backed orders, we need to get fulfilled reservations with timestamps
      // to filter by sync time
      const fulfilledReservations = await db
        .select({
          sellOrderId: orderReservations.sellOrderId,
          quantity: orderReservations.quantity,
          updatedAt: orderReservations.updatedAt,
        })
        .from(orderReservations)
        .where(
          and(
            inArray(orderReservations.sellOrderId, orderIds),
            eq(orderReservations.status, 'fulfilled')
          )
        )

      // Build a map of orderId -> list of fulfilled reservations
      const fulfilledByOrder = new Map<number, Array<{ quantity: number; updatedAt: Date }>>()
      for (const r of fulfilledReservations) {
        if (r.sellOrderId !== null) {
          const list = fulfilledByOrder.get(r.sellOrderId) ?? []
          list.push({ quantity: r.quantity, updatedAt: r.updatedAt })
          fulfilledByOrder.set(r.sellOrderId, list)
        }
      }

      // Build order lookup for limit mode
      const orderLimitModes = new Map(orders.map(o => [o.id, o.limitMode]))
      const orderLocations = new Map(orders.map(o => [o.id, o.locationId]))

      for (const stat of reservationStats) {
        if (stat.sellOrderId !== null) {
          const limitMode = orderLimitModes.get(stat.sellOrderId) ?? 'none'
          const locationId = orderLocations.get(stat.sellOrderId)
          const syncTime = locationId ? syncTimeMap.get(locationId) : null

          let fulfilledQuantity = 0

          if (limitMode === 'max_sell') {
            // max_sell is not FIO-backed, always count all fulfilled
            fulfilledQuantity = stat.fulfilledQuantity
          } else {
            // none/reserve are FIO-backed
            // Only count fulfilled reservations that happened AFTER the last FIO sync
            const fulfilled = fulfilledByOrder.get(stat.sellOrderId) ?? []
            for (const r of fulfilled) {
              if (!syncTime || r.updatedAt > syncTime) {
                fulfilledQuantity += r.quantity
              }
            }
          }

          reservationMap.set(stat.sellOrderId, {
            count: stat.count,
            quantity: stat.quantity,
            fulfilledQuantity,
          })
        }
      }

      // Handle orders with no reservations at all (not in reservationStats)
      // They'll get default values in the map lookup below
    }

    return Promise.all(
      orders.map(async order => {
        const key = `${order.commodityTicker}:${order.locationId}`
        const fioQuantity = inventoryMap.get(key) ?? 0
        const availableQuantity = calculateAvailableQuantity(
          fioQuantity,
          order.limitMode,
          order.limitQuantity
        )
        const reservationData = reservationMap.get(order.id) ?? {
          count: 0,
          quantity: 0,
          fulfilledQuantity: 0,
        }
        const remainingQuantity = Math.max(
          0,
          availableQuantity - reservationData.quantity - reservationData.fulfilledQuantity
        )
        const fioUploadedAt = fioUploadedAtMap.get(order.locationId)

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
          fioQuantity,
          availableQuantity,
          activeReservationCount: reservationData.count,
          reservedQuantity: reservationData.quantity,
          fulfilledQuantity: reservationData.fulfilledQuantity,
          remainingQuantity,
          fioUploadedAt: fioUploadedAt?.toISOString() ?? null,
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

    // Get FIO inventory and sync time for this commodity/location
    const {
      quantity: fioQuantity,
      lastSyncedAt,
      fioUploadedAt,
    } = await this.getInventoryWithSyncTime(userId, order.commodityTicker, order.locationId)

    const availableQuantity = calculateAvailableQuantity(
      fioQuantity,
      order.limitMode,
      order.limitQuantity
    )

    // Get reservation counts (with FIO-aware fulfilled calculation)
    const reservationData = await this.getReservationCounts(order.id, order.limitMode, lastSyncedAt)
    const remainingQuantity = Math.max(
      0,
      availableQuantity - reservationData.quantity - reservationData.fulfilledQuantity
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
      price: parseFloat(order.price),
      currency: order.currency,
      priceListCode: order.priceListCode,
      orderType: order.orderType,
      limitMode: order.limitMode,
      limitQuantity: order.limitQuantity,
      fioQuantity,
      availableQuantity,
      activeReservationCount: reservationData.count,
      reservedQuantity: reservationData.quantity,
      fulfilledQuantity: reservationData.fulfilledQuantity,
      remainingQuantity,
      fioUploadedAt: fioUploadedAt?.toISOString() ?? null,
      pricingMode,
      effectivePrice,
      isFallback,
      priceLocationId,
    }
  }

  /**
   * Helper to get inventory quantity and sync time for a commodity at a location
   */
  private async getInventoryWithSyncTime(
    userId: number,
    commodityTicker: string,
    locationId: string
  ): Promise<{ quantity: number; lastSyncedAt: Date | null; fioUploadedAt: Date | null }> {
    const items = await db
      .select({
        quantity: fioInventory.quantity,
        lastSyncedAt: fioUserStorage.lastSyncedAt,
        fioUploadedAt: fioUserStorage.fioUploadedAt,
      })
      .from(fioInventory)
      .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
      .where(
        and(
          eq(fioUserStorage.userId, userId),
          eq(fioInventory.commodityTicker, commodityTicker),
          eq(fioUserStorage.locationId, locationId)
        )
      )

    let totalQuantity = 0
    let latestSyncTime: Date | null = null
    let latestFioUploadedAt: Date | null = null
    for (const item of items) {
      totalQuantity += item.quantity
      if (!latestSyncTime || item.lastSyncedAt > latestSyncTime) {
        latestSyncTime = item.lastSyncedAt
      }
      if (
        item.fioUploadedAt &&
        (!latestFioUploadedAt || item.fioUploadedAt > latestFioUploadedAt)
      ) {
        latestFioUploadedAt = item.fioUploadedAt
      }
    }

    return {
      quantity: totalQuantity,
      lastSyncedAt: latestSyncTime,
      fioUploadedAt: latestFioUploadedAt,
    }
  }

  /**
   * Helper to get reservation counts for a sell order
   * For FIO-backed orders (none/reserve), only counts fulfilled reservations
   * that occurred after the last FIO sync
   */
  private async getReservationCounts(
    sellOrderId: number,
    limitMode: SellOrderLimitMode,
    lastSyncedAt: Date | null
  ): Promise<{ count: number; quantity: number; fulfilledQuantity: number }> {
    // Get active reservation stats
    const result = await db
      .select({
        count: sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed'))::int`,
        quantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed')), 0)::int`,
      })
      .from(orderReservations)
      .where(eq(orderReservations.sellOrderId, sellOrderId))

    const stats = result[0] ?? { count: 0, quantity: 0 }

    // Calculate fulfilled quantity based on limit mode
    let fulfilledQuantity = 0

    if (limitMode === 'max_sell') {
      // max_sell is not FIO-backed, always count all fulfilled
      const fulfilledResult = await db
        .select({
          total: sql<number>`coalesce(sum(${orderReservations.quantity}), 0)::int`,
        })
        .from(orderReservations)
        .where(
          and(
            eq(orderReservations.sellOrderId, sellOrderId),
            eq(orderReservations.status, 'fulfilled')
          )
        )
      fulfilledQuantity = fulfilledResult[0]?.total ?? 0
    } else {
      // none/reserve are FIO-backed
      // Only count fulfilled reservations that happened AFTER the last FIO sync
      const fulfilledReservations = await db
        .select({
          quantity: orderReservations.quantity,
          updatedAt: orderReservations.updatedAt,
        })
        .from(orderReservations)
        .where(
          and(
            eq(orderReservations.sellOrderId, sellOrderId),
            eq(orderReservations.status, 'fulfilled')
          )
        )

      for (const r of fulfilledReservations) {
        if (!lastSyncedAt || r.updatedAt > lastSyncedAt) {
          fulfilledQuantity += r.quantity
        }
      }
    }

    return { count: stats.count, quantity: stats.quantity, fulfilledQuantity }
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

    // Get FIO inventory for this commodity/location
    const { quantity: fioQuantity, fioUploadedAt } = await this.getInventoryWithSyncTime(
      userId,
      body.commodityTicker,
      body.locationId
    )

    const availableQuantity = calculateAvailableQuantity(
      fioQuantity,
      newOrder.limitMode,
      newOrder.limitQuantity
    )

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
      fioQuantity,
      availableQuantity,
      activeReservationCount: 0, // New order has no reservations
      reservedQuantity: 0,
      fulfilledQuantity: 0,
      remainingQuantity: availableQuantity,
      fioUploadedAt: fioUploadedAt?.toISOString() ?? null,
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

    // Get FIO inventory and sync time
    const {
      quantity: fioQuantity,
      lastSyncedAt,
      fioUploadedAt,
    } = await this.getInventoryWithSyncTime(userId, updated.commodityTicker, updated.locationId)

    const availableQuantity = calculateAvailableQuantity(
      fioQuantity,
      updated.limitMode,
      updated.limitQuantity
    )

    // Get reservation counts (with FIO-aware fulfilled calculation)
    const reservationData = await this.getReservationCounts(
      updated.id,
      updated.limitMode,
      lastSyncedAt
    )
    const remainingQuantity = Math.max(
      0,
      availableQuantity - reservationData.quantity - reservationData.fulfilledQuantity
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
      price: parseFloat(updated.price),
      currency: updated.currency,
      priceListCode: updated.priceListCode,
      orderType: updated.orderType,
      limitMode: updated.limitMode,
      limitQuantity: updated.limitQuantity,
      fioQuantity,
      availableQuantity,
      activeReservationCount: reservationData.count,
      reservedQuantity: reservationData.quantity,
      fulfilledQuantity: reservationData.fulfilledQuantity,
      remainingQuantity,
      fioUploadedAt: fioUploadedAt?.toISOString() ?? null,
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
