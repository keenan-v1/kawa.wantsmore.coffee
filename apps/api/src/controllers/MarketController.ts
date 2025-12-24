import { Controller, Get, Query, Route, Security, Tags, Request } from 'tsoa'
import type { Currency, OrderType, PricingMode } from '@kawakawa/types'
import {
  enrichSellOrdersWithQuantities,
  getReservationStatsForBuyOrders,
} from '@kawakawa/services/market'
import { db, sellOrders, buyOrders, users } from '../db/index.js'
import { eq } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { hasPermission } from '../utils/permissionService.js'
import { fioClient } from '../services/fio/client.js'
import { calculateEffectivePriceWithFallback } from '../services/price-calculator.js'

// Market listing with seller info and calculated availability
interface MarketListing {
  id: number
  sellerName: string
  commodityTicker: string
  locationId: string
  price: number // Fixed price (0 for dynamic pricing)
  currency: Currency
  priceListCode: string | null // null = custom/fixed price, set = dynamic pricing
  effectivePrice: number | null // Calculated price when using price list (null if unavailable)
  isFallback: boolean // true if price came from price list's default location
  priceLocationId: string | null // Location the price came from (different from locationId if fallback)
  pricingMode: PricingMode // 'fixed' = custom price, 'dynamic' = from price list
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
  price: number // Fixed price (0 for dynamic pricing)
  currency: Currency
  priceListCode: string | null // null = custom/fixed price, set = dynamic pricing
  effectivePrice: number | null // Calculated price when using price list (null if unavailable)
  isFallback: boolean // true if price came from price list's default location
  priceLocationId: string | null // Location the price came from (different from locationId if fallback)
  pricingMode: PricingMode // 'fixed' = custom price, 'dynamic' = from price list
  orderType: OrderType
  isOwn: boolean
  jumpCount: number | null // Jump count from destination (null if no destination specified)
  activeReservationCount: number // count of pending/confirmed reservations
  reservedQuantity: number // sum of quantities in active reservations
  remainingQuantity: number // quantity - reservedQuantity
  fioUploadedAt: string | null // Not applicable for buy orders (always null)
}

// Intermediate type for filtered sell orders (before final transformation)
interface FilteredSellOrder {
  id: number
  userId: number
  commodityTicker: string
  locationId: string
  price: string
  currency: Currency
  priceListCode: string | null
  orderType: OrderType
  limitMode: 'none' | 'max_sell' | 'reserve'
  limitQuantity: number | null
  sellerName: string
  fioQuantity: number
  availableQuantity: number
  isOwn: boolean
  fioUploadedAt: Date | null
  effectivePrice: number | null
  isFallback: boolean
  priceLocationId: string | null
  pricingMode: PricingMode
}

// Intermediate type for filtered buy orders (before final transformation)
interface FilteredBuyOrder {
  id: number
  userId: number
  commodityTicker: string
  locationId: string
  quantity: number
  price: string
  currency: Currency
  priceListCode: string | null
  orderType: OrderType
  buyerName: string
  isOwn: boolean
  effectivePrice: number | null
  isFallback: boolean
  priceLocationId: string | null
  pricingMode: PricingMode
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

    // Get all sell orders with user info
    const orders = await db
      .select({
        id: sellOrders.id,
        userId: sellOrders.userId,
        commodityTicker: sellOrders.commodityTicker,
        locationId: sellOrders.locationId,
        price: sellOrders.price,
        currency: sellOrders.currency,
        priceListCode: sellOrders.priceListCode,
        orderType: sellOrders.orderType,
        limitMode: sellOrders.limitMode,
        limitQuantity: sellOrders.limitQuantity,
        sellerName: users.displayName,
      })
      .from(sellOrders)
      .innerJoin(users, eq(sellOrders.userId, users.id))

    if (orders.length === 0) {
      return []
    }

    // Use shared service for quantity enrichment (handles FIO-aware expiration correctly)
    const quantityInfo = await enrichSellOrdersWithQuantities(
      orders.map(o => ({
        id: o.id,
        userId: o.userId,
        commodityTicker: o.commodityTicker,
        locationId: o.locationId,
        limitMode: o.limitMode,
        limitQuantity: o.limitQuantity,
      }))
    )

    // Process orders and filter by permissions
    const filteredOrders: FilteredSellOrder[] = []

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

      // Get quantity info from shared service
      const qty = quantityInfo.get(order.id)

      // Determine pricing mode and effective price
      const orderPrice = parseFloat(order.price)
      const pricingMode: PricingMode = order.priceListCode && orderPrice === 0 ? 'dynamic' : 'fixed'
      let effectivePrice: number | null = null
      let isFallback = false
      let priceLocationId: string | null = null

      if (pricingMode === 'dynamic' && order.priceListCode) {
        // Calculate effective price from price list
        const effPrice = await calculateEffectivePriceWithFallback(
          order.priceListCode,
          order.commodityTicker,
          order.locationId,
          order.currency
        )
        effectivePrice = effPrice?.finalPrice ?? null
        isFallback = effPrice?.isFallback ?? false
        priceLocationId = effPrice?.locationId ?? null
      }

      filteredOrders.push({
        id: order.id,
        userId: order.userId,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        price: order.price,
        currency: order.currency,
        priceListCode: order.priceListCode,
        orderType: order.orderType,
        limitMode: order.limitMode,
        limitQuantity: order.limitQuantity,
        sellerName: order.sellerName,
        fioQuantity: qty?.fioQuantity ?? 0,
        availableQuantity: qty?.availableQuantity ?? 0,
        isOwn,
        fioUploadedAt: qty?.fioUploadedAt ?? null,
        effectivePrice,
        isFallback,
        priceLocationId,
        pricingMode,
      })
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

    // Build final listings using quantity info from shared service
    const listings: MarketListing[] = filteredOrders.map(order => {
      const qty = quantityInfo.get(order.id)

      return {
        id: order.id,
        sellerName: order.sellerName,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        price: parseFloat(order.price),
        currency: order.currency,
        priceListCode: order.priceListCode,
        effectivePrice: order.effectivePrice,
        isFallback: order.isFallback,
        priceLocationId: order.priceLocationId,
        pricingMode: order.pricingMode,
        orderType: order.orderType,
        availableQuantity: order.availableQuantity,
        isOwn: order.isOwn,
        jumpCount: destination ? (jumpCountMap.get(order.locationId) ?? null) : null,
        activeReservationCount: qty?.activeReservationCount ?? 0,
        reservedQuantity: qty?.reservedQuantity ?? 0,
        remainingQuantity: qty?.remainingQuantity ?? 0,
        fioUploadedAt: order.fioUploadedAt?.toISOString() ?? null,
      }
    })

    // Sort by commodity, then location, then price (or by jumpCount if destination provided)
    // Use effectivePrice for dynamic orders, price for fixed orders
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
      // Use effective price for dynamic orders, fixed price otherwise
      const aPrice = a.pricingMode === 'dynamic' ? (a.effectivePrice ?? Infinity) : a.price
      const bPrice = b.pricingMode === 'dynamic' ? (b.effectivePrice ?? Infinity) : b.price
      return aPrice - bPrice
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

    // Get all buy orders with user info
    const orders = await db
      .select({
        id: buyOrders.id,
        userId: buyOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        quantity: buyOrders.quantity,
        price: buyOrders.price,
        currency: buyOrders.currency,
        priceListCode: buyOrders.priceListCode,
        orderType: buyOrders.orderType,
        buyerName: users.displayName,
      })
      .from(buyOrders)
      .innerJoin(users, eq(buyOrders.userId, users.id))

    if (orders.length === 0) {
      return []
    }

    // Use shared service for reservation stats (handles expiration correctly)
    const reservationStats = await getReservationStatsForBuyOrders(orders.map(o => o.id))

    // Process orders and filter by permissions
    const filteredBuyOrders: FilteredBuyOrder[] = []

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

      // Determine pricing mode and effective price
      const orderPrice = parseFloat(order.price)
      const pricingMode: PricingMode = order.priceListCode && orderPrice === 0 ? 'dynamic' : 'fixed'
      let effectivePrice: number | null = null
      let isFallback = false
      let priceLocationId: string | null = null

      if (pricingMode === 'dynamic' && order.priceListCode) {
        // Calculate effective price from price list
        const effPrice = await calculateEffectivePriceWithFallback(
          order.priceListCode,
          order.commodityTicker,
          order.locationId,
          order.currency
        )
        effectivePrice = effPrice?.finalPrice ?? null
        isFallback = effPrice?.isFallback ?? false
        priceLocationId = effPrice?.locationId ?? null
      }

      filteredBuyOrders.push({
        id: order.id,
        userId: order.userId,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        quantity: order.quantity,
        price: order.price,
        currency: order.currency,
        priceListCode: order.priceListCode,
        orderType: order.orderType,
        buyerName: order.buyerName,
        isOwn,
        effectivePrice,
        isFallback,
        priceLocationId,
        pricingMode,
      })
    }

    // Calculate jump counts if destination is provided
    const jumpCountMap = new Map<string, number | null>()
    if (destination) {
      const uniqueLocations = [...new Set(filteredBuyOrders.map(o => o.locationId))]
      await Promise.all(
        uniqueLocations.map(async locationId => {
          const jumpCount = await fioClient.getJumpCount(destination, locationId)
          jumpCountMap.set(locationId, jumpCount)
        })
      )
    }

    // Build final requests using reservation stats from shared service
    const requests: MarketBuyRequest[] = filteredBuyOrders.map(order => {
      const stats = reservationStats.get(order.id) ?? {
        count: 0,
        quantity: 0,
        fulfilledQuantity: 0,
      }
      // Subtract both active reservations AND fulfilled from remaining quantity
      const remainingQuantity = order.quantity - stats.quantity - stats.fulfilledQuantity

      return {
        id: order.id,
        buyerName: order.buyerName,
        commodityTicker: order.commodityTicker,
        locationId: order.locationId,
        quantity: order.quantity,
        price: parseFloat(order.price),
        currency: order.currency,
        priceListCode: order.priceListCode,
        effectivePrice: order.effectivePrice,
        isFallback: order.isFallback,
        priceLocationId: order.priceLocationId,
        pricingMode: order.pricingMode,
        orderType: order.orderType,
        isOwn: order.isOwn,
        jumpCount: destination ? (jumpCountMap.get(order.locationId) ?? null) : null,
        activeReservationCount: stats.count,
        reservedQuantity: stats.quantity,
        remainingQuantity,
        fioUploadedAt: null, // Not applicable for buy orders
      }
    })

    // Sort by commodity, then location, then price (highest first for buy orders)
    // Use effectivePrice for dynamic orders, price for fixed orders
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
      // Use effective price for dynamic orders, fixed price otherwise
      const aPrice = a.pricingMode === 'dynamic' ? (a.effectivePrice ?? 0) : a.price
      const bPrice = b.pricingMode === 'dynamic' ? (b.effectivePrice ?? 0) : b.price
      return bPrice - aPrice // Higher prices first for buy orders
    })

    return requests
  }
}
