import { Controller, Get, Query, Route, Security, Tags, Request } from 'tsoa'
import type { Currency, OrderType } from '@kawakawa/types'
import {
  db,
  sellOrders,
  buyOrders,
  fioInventory,
  fioUserStorage,
  users,
  orderReservations,
} from '../db/index.js'
import { eq, inArray, sql } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { hasPermission } from '../utils/permissionService.js'
import { fioClient } from '../services/fio/client.js'

// Market listing with seller info and calculated availability
interface MarketListing {
  id: number
  sellerName: string
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  orderType: OrderType
  availableQuantity: number
  isOwn: boolean // true if this is the current user's listing
  jumpCount: number | null // Jump count from destination (null if no destination specified)
  activeReservationCount: number // count of pending/confirmed reservations
  reservedQuantity: number // sum of quantities in active reservations
  remainingQuantity: number // availableQuantity - reservedQuantity
  fioUploadedAt: string | null // When seller's FIO inventory was last synced from game
}

// Buy request from market (buy orders from all users)
interface MarketBuyRequest {
  id: number
  buyerName: string
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  orderType: OrderType
  isOwn: boolean
  jumpCount: number | null // Jump count from destination (null if no destination specified)
  activeReservationCount: number // count of pending/confirmed reservations
  reservedQuantity: number // sum of quantities in active reservations
  remainingQuantity: number // quantity - reservedQuantity
  fioUploadedAt: string | null // Not applicable for buy orders (always null)
}

/**
 * Calculate available quantity based on FIO inventory and limit settings
 */
function calculateAvailableQuantity(
  fioQuantity: number,
  limitMode: 'none' | 'max_sell' | 'reserve',
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

@Route('market')
@Tags('Market')
@Security('jwt')
export class MarketController extends Controller {
  /**
   * Get all available sell orders on the market (from other users)
   * Filters by order type based on user permissions
   * @param destination Location ID to calculate jump counts from (optional)
   */
  @Get('listings')
  public async getMarketListings(
    @Request() request: { user: JwtPayload },
    @Query() commodity?: string,
    @Query() location?: string,
    @Query() destination?: string
  ): Promise<MarketListing[]> {
    const userId = request.user.userId
    const userRoles = request.user.roles

    // Check what order types the user can view
    const canViewInternal = await hasPermission(userRoles, 'orders.view_internal')
    const canViewPartner = await hasPermission(userRoles, 'orders.view_partner')

    if (!canViewInternal && !canViewPartner) {
      return []
    }

    // Get all sell orders (including user's own)
    const orders = await db
      .select({
        id: sellOrders.id,
        userId: sellOrders.userId,
        commodityTicker: sellOrders.commodityTicker,
        locationId: sellOrders.locationId,
        price: sellOrders.price,
        currency: sellOrders.currency,
        orderType: sellOrders.orderType,
        limitMode: sellOrders.limitMode,
        limitQuantity: sellOrders.limitQuantity,
        sellerName: users.displayName,
      })
      .from(sellOrders)
      .innerJoin(users, eq(sellOrders.userId, users.id))

    // Get inventory for all sellers to calculate available quantities
    const sellerIds = [...new Set(orders.map(o => o.userId))]

    if (sellerIds.length === 0) {
      return []
    }

    // Get all inventory data for sellers
    const inventoryData = await db
      .select({
        userId: fioUserStorage.userId,
        commodityTicker: fioInventory.commodityTicker,
        quantity: fioInventory.quantity,
        locationId: fioUserStorage.locationId,
        fioUploadedAt: fioUserStorage.fioUploadedAt,
      })
      .from(fioInventory)
      .innerJoin(fioUserStorage, eq(fioInventory.userStorageId, fioUserStorage.id))
      .where(inArray(fioUserStorage.userId, sellerIds))

    // Build inventory lookup map: "userId:ticker:locationId" -> { quantity, fioUploadedAt }
    const inventoryMap = new Map<string, { quantity: number; fioUploadedAt: Date | null }>()
    for (const item of inventoryData) {
      if (item.locationId) {
        const key = `${item.userId}:${item.commodityTicker}:${item.locationId}`
        const existing = inventoryMap.get(key)
        const newQuantity = (existing?.quantity ?? 0) + item.quantity
        // Keep the most recent fioUploadedAt from any storage at this location
        let fioUploadedAt = existing?.fioUploadedAt ?? null
        if (item.fioUploadedAt) {
          if (!fioUploadedAt || item.fioUploadedAt > fioUploadedAt) {
            fioUploadedAt = item.fioUploadedAt
          }
        }
        inventoryMap.set(key, { quantity: newQuantity, fioUploadedAt })
      }
    }

    // Process orders and filter by permissions and availability
    const filteredOrders: Array<
      (typeof orders)[0] & {
        fioQuantity: number
        availableQuantity: number
        isOwn: boolean
        fioUploadedAt: Date | null
      }
    > = []

    for (const order of orders) {
      const isOwn = order.userId === userId

      // Filter by order type permissions (always show user's own orders)
      if (!isOwn) {
        if (order.orderType === 'internal' && !canViewInternal) continue
        if (order.orderType === 'partner' && !canViewPartner) continue
      }

      // Filter by commodity if specified
      if (commodity && order.commodityTicker !== commodity) continue

      // Filter by location if specified
      if (location && order.locationId !== location) continue

      // Calculate available quantity
      const key = `${order.userId}:${order.commodityTicker}:${order.locationId}`
      const inventoryInfo = inventoryMap.get(key) ?? { quantity: 0, fioUploadedAt: null }
      const availableQuantity = calculateAvailableQuantity(
        inventoryInfo.quantity,
        order.limitMode,
        order.limitQuantity
      )

      // Only include if there's available quantity (always show user's own orders even if 0)
      if (availableQuantity > 0 || isOwn) {
        filteredOrders.push({
          ...order,
          fioQuantity: inventoryInfo.quantity,
          availableQuantity,
          isOwn,
          fioUploadedAt: inventoryInfo.fioUploadedAt,
        })
      }
    }

    // Calculate jump counts if destination is provided
    const jumpCountMap = new Map<string, number | null>()
    if (destination) {
      const uniqueLocations = [...new Set(filteredOrders.map(o => o.locationId))]
      await Promise.all(
        uniqueLocations.map(async locationId => {
          const jumpCount = await fioClient.getJumpCount(destination, locationId)
          jumpCountMap.set(locationId, jumpCount)
        })
      )
    }

    // Get reservation counts for all sell orders (including fulfilled)
    const sellOrderIds = filteredOrders.map(o => o.id)
    const reservationMap = new Map<
      number,
      { count: number; quantity: number; fulfilledQuantity: number }
    >()

    if (sellOrderIds.length > 0) {
      const reservationStats = await db
        .select({
          sellOrderId: orderReservations.sellOrderId,
          count: sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed'))::int`,
          quantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed')), 0)::int`,
          fulfilledQuantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled'), 0)::int`,
        })
        .from(orderReservations)
        .where(inArray(orderReservations.sellOrderId, sellOrderIds))
        .groupBy(orderReservations.sellOrderId)

      for (const stat of reservationStats) {
        if (stat.sellOrderId !== null) {
          reservationMap.set(stat.sellOrderId, {
            count: stat.count,
            quantity: stat.quantity,
            fulfilledQuantity: stat.fulfilledQuantity,
          })
        }
      }
    }

    // Build final listings
    const listings: MarketListing[] = filteredOrders.map(order => {
      const reservationData = reservationMap.get(order.id) ?? {
        count: 0,
        quantity: 0,
        fulfilledQuantity: 0,
      }
      // Subtract both active reservations AND fulfilled from remaining quantity
      const remainingQuantity = Math.max(
        0,
        order.availableQuantity - reservationData.quantity - reservationData.fulfilledQuantity
      )

      return {
        id: order.id,
        sellerName: order.sellerName,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        price: parseFloat(order.price),
        currency: order.currency,
        orderType: order.orderType,
        availableQuantity: order.availableQuantity,
        isOwn: order.isOwn,
        jumpCount: destination ? (jumpCountMap.get(order.locationId) ?? null) : null,
        activeReservationCount: reservationData.count,
        reservedQuantity: reservationData.quantity,
        remainingQuantity,
        fioUploadedAt: order.fioUploadedAt?.toISOString() ?? null,
      }
    })

    // Sort by commodity, then location, then price (or by jumpCount if destination provided)
    listings.sort((a, b) => {
      // If destination is provided, sort by jump count first
      if (destination) {
        const aJumps = a.jumpCount ?? Infinity
        const bJumps = b.jumpCount ?? Infinity
        if (aJumps !== bJumps) return aJumps - bJumps
      }
      if (a.commodityTicker !== b.commodityTicker) {
        return a.commodityTicker.localeCompare(b.commodityTicker)
      }
      if (a.locationId !== b.locationId) {
        return a.locationId.localeCompare(b.locationId)
      }
      return a.price - b.price
    })

    return listings
  }

  /**
   * Get all buy requests on the market (from all users)
   * Filters by order type based on user permissions
   * @param destination Location ID to calculate jump counts from (optional)
   */
  @Get('buy-requests')
  public async getMarketBuyRequests(
    @Request() request: { user: JwtPayload },
    @Query() commodity?: string,
    @Query() location?: string,
    @Query() destination?: string
  ): Promise<MarketBuyRequest[]> {
    const userId = request.user.userId
    const userRoles = request.user.roles

    // Check what order types the user can view
    const canViewInternal = await hasPermission(userRoles, 'orders.view_internal')
    const canViewPartner = await hasPermission(userRoles, 'orders.view_partner')

    if (!canViewInternal && !canViewPartner) {
      return []
    }

    // Get all buy orders
    const orders = await db
      .select({
        id: buyOrders.id,
        userId: buyOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        quantity: buyOrders.quantity,
        price: buyOrders.price,
        currency: buyOrders.currency,
        orderType: buyOrders.orderType,
        buyerName: users.displayName,
      })
      .from(buyOrders)
      .innerJoin(users, eq(buyOrders.userId, users.id))

    // Process orders and filter by permissions
    const filteredOrders: Array<(typeof orders)[0] & { isOwn: boolean }> = []

    for (const order of orders) {
      const isOwn = order.userId === userId

      // Filter by order type permissions (always show user's own orders)
      if (!isOwn) {
        if (order.orderType === 'internal' && !canViewInternal) continue
        if (order.orderType === 'partner' && !canViewPartner) continue
      }

      // Filter by commodity if specified
      if (commodity && order.commodityTicker !== commodity) continue

      // Filter by location if specified
      if (location && order.locationId !== location) continue

      filteredOrders.push({ ...order, isOwn })
    }

    // Calculate jump counts if destination is provided
    const jumpCountMap = new Map<string, number | null>()
    if (destination) {
      const uniqueLocations = [...new Set(filteredOrders.map(o => o.locationId))]
      await Promise.all(
        uniqueLocations.map(async locationId => {
          const jumpCount = await fioClient.getJumpCount(destination, locationId)
          jumpCountMap.set(locationId, jumpCount)
        })
      )
    }

    // Get reservation counts for all buy orders (including fulfilled)
    const buyOrderIds = filteredOrders.map(o => o.id)
    const buyReservationMap = new Map<
      number,
      { count: number; quantity: number; fulfilledQuantity: number }
    >()

    if (buyOrderIds.length > 0) {
      const reservationStats = await db
        .select({
          buyOrderId: orderReservations.buyOrderId,
          count: sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed'))::int`,
          quantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed')), 0)::int`,
          fulfilledQuantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled'), 0)::int`,
        })
        .from(orderReservations)
        .where(inArray(orderReservations.buyOrderId, buyOrderIds))
        .groupBy(orderReservations.buyOrderId)

      for (const stat of reservationStats) {
        if (stat.buyOrderId !== null) {
          buyReservationMap.set(stat.buyOrderId, {
            count: stat.count,
            quantity: stat.quantity,
            fulfilledQuantity: stat.fulfilledQuantity,
          })
        }
      }
    }

    // Build final requests
    const requests: MarketBuyRequest[] = filteredOrders.map(order => {
      const reservationData = buyReservationMap.get(order.id) ?? {
        count: 0,
        quantity: 0,
        fulfilledQuantity: 0,
      }
      // Subtract both active reservations AND fulfilled from remaining quantity
      const remainingQuantity = Math.max(
        0,
        order.quantity - reservationData.quantity - reservationData.fulfilledQuantity
      )

      return {
        id: order.id,
        buyerName: order.buyerName,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        quantity: order.quantity,
        price: parseFloat(order.price),
        currency: order.currency,
        orderType: order.orderType,
        isOwn: order.isOwn,
        jumpCount: destination ? (jumpCountMap.get(order.locationId) ?? null) : null,
        activeReservationCount: reservationData.count,
        reservedQuantity: reservationData.quantity,
        remainingQuantity,
        fioUploadedAt: null, // Not applicable for buy orders
      }
    })

    // Sort by commodity, then location, then price (highest first for buy orders)
    // If destination provided, sort by jump count first
    requests.sort((a, b) => {
      // If destination is provided, sort by jump count first
      if (destination) {
        const aJumps = a.jumpCount ?? Infinity
        const bJumps = b.jumpCount ?? Infinity
        if (aJumps !== bJumps) return aJumps - bJumps
      }
      if (a.commodityTicker !== b.commodityTicker) {
        return a.commodityTicker.localeCompare(b.commodityTicker)
      }
      if (a.locationId !== b.locationId) {
        return a.locationId.localeCompare(b.locationId)
      }
      return b.price - a.price // Higher prices first for buy orders
    })

    return requests
  }
}
