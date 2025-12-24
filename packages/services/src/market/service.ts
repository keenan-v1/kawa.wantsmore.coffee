import { db, fioInventory, fioUserStorage, orderReservations } from '@kawakawa/db'
import { and, eq, inArray, or, gt, isNull, sql } from 'drizzle-orm'
import type { SellOrderLimitMode } from '@kawakawa/types'

/**
 * Inventory information for a specific commodity at a location
 */
export interface InventoryInfo {
  quantity: number
  fioUploadedAt: Date | null
}

/**
 * Reservation statistics for a sell order
 */
export interface ReservationStats {
  count: number
  quantity: number
  fulfilledQuantity: number
}

/**
 * Full quantity breakdown for a sell order
 */
export interface SellOrderQuantityInfo {
  fioQuantity: number
  availableQuantity: number
  reservedQuantity: number
  fulfilledQuantity: number
  remainingQuantity: number
  activeReservationCount: number
  fioUploadedAt: Date | null
}

/**
 * Calculate available quantity based on FIO inventory and limit settings.
 * This is the core calculation shared across the codebase.
 *
 * @param fioQuantity - Raw quantity from FIO inventory
 * @param limitMode - How to limit sales:
 *   - 'none': Sell all available inventory
 *   - 'max_sell': Cap at limitQuantity (don't sell more than X)
 *   - 'reserve': Keep limitQuantity in reserve (only sell excess)
 * @param limitQuantity - The limit value for max_sell/reserve modes
 */
export function calculateAvailableQuantity(
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
 * Get inventory data for multiple users, building a lookup map.
 *
 * @param userIds - Array of user IDs to fetch inventory for
 * @returns Map with key "userId:ticker:locationId" -> InventoryInfo
 */
export async function getInventoryForUsers(userIds: number[]): Promise<Map<string, InventoryInfo>> {
  if (userIds.length === 0) {
    return new Map()
  }

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
    .where(inArray(fioUserStorage.userId, userIds))

  const inventoryMap = new Map<string, InventoryInfo>()

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

  return inventoryMap
}

/**
 * Individual fulfilled reservation with timestamp for FIO-aware calculation
 */
interface FulfilledReservation {
  orderId: number
  quantity: number
  updatedAt: Date
  expiresAt: Date | null
}

/**
 * Get active (pending/confirmed) reservation statistics for sell orders.
 * Only counts reservations that are not expired.
 *
 * @param sellOrderIds - Array of sell order IDs to fetch stats for
 * @returns Map with sellOrderId -> { count, quantity }
 */
async function getActiveReservationStatsForSellOrders(
  sellOrderIds: number[]
): Promise<Map<number, { count: number; quantity: number }>> {
  if (sellOrderIds.length === 0) {
    return new Map()
  }

  const now = new Date()

  const reservationStats = await db
    .select({
      sellOrderId: orderReservations.sellOrderId,
      count: sql<number>`count(*)::int`.as('count'),
      quantity: sql<number>`coalesce(sum(${orderReservations.quantity}), 0)::int`.as('quantity'),
    })
    .from(orderReservations)
    .where(
      and(
        inArray(orderReservations.sellOrderId, sellOrderIds),
        inArray(orderReservations.status, ['pending', 'confirmed']),
        // Only count non-expired reservations
        or(isNull(orderReservations.expiresAt), gt(orderReservations.expiresAt, now))
      )
    )
    .groupBy(orderReservations.sellOrderId)

  const statsMap = new Map<number, { count: number; quantity: number }>()

  for (const stat of reservationStats) {
    if (stat.sellOrderId !== null) {
      statsMap.set(stat.sellOrderId, {
        count: stat.count,
        quantity: stat.quantity,
      })
    }
  }

  return statsMap
}

/**
 * Get fulfilled reservations for sell orders with their timestamps.
 * Used for FIO-aware fulfilled quantity calculation.
 *
 * @param sellOrderIds - Array of sell order IDs to fetch fulfilled reservations for
 * @returns Map with sellOrderId -> array of fulfilled reservations
 */
async function getFulfilledReservationsForSellOrders(
  sellOrderIds: number[]
): Promise<Map<number, FulfilledReservation[]>> {
  if (sellOrderIds.length === 0) {
    return new Map()
  }

  const fulfilledReservations = await db
    .select({
      sellOrderId: orderReservations.sellOrderId,
      quantity: orderReservations.quantity,
      updatedAt: orderReservations.updatedAt,
      expiresAt: orderReservations.expiresAt,
    })
    .from(orderReservations)
    .where(
      and(
        inArray(orderReservations.sellOrderId, sellOrderIds),
        eq(orderReservations.status, 'fulfilled')
      )
    )

  const resultMap = new Map<number, FulfilledReservation[]>()

  for (const r of fulfilledReservations) {
    if (r.sellOrderId !== null) {
      const list = resultMap.get(r.sellOrderId) ?? []
      list.push({
        orderId: r.sellOrderId,
        quantity: r.quantity,
        updatedAt: r.updatedAt,
        expiresAt: r.expiresAt,
      })
      resultMap.set(r.sellOrderId, list)
    }
  }

  return resultMap
}

/**
 * Calculate fulfilled quantity that should still count against available.
 * Fulfilled reservations stop counting when:
 * 1. FIO upload date > reservation updatedAt (FIO already reflects the sale)
 * 2. OR if no FIO date, when expiresAt < now (expired)
 *
 * @param reservations - Array of fulfilled reservations
 * @param fioUploadedAt - When FIO last synced from game for this order's location
 * @returns Quantity that should still count against available
 */
export function calculateEffectiveFulfilledQuantity(
  reservations: FulfilledReservation[],
  fioUploadedAt: Date | null
): number {
  const now = new Date()
  let quantity = 0

  for (const r of reservations) {
    // Check if this reservation should still count
    if (fioUploadedAt && fioUploadedAt > r.updatedAt) {
      // FIO synced after this reservation was fulfilled - FIO already reflects it
      continue
    }

    // No FIO sync after fulfillment - check expiration as fallback
    if (r.expiresAt && r.expiresAt < now) {
      // Expired - don't count
      continue
    }

    // Still counts against available
    quantity += r.quantity
  }

  return quantity
}

/**
 * Get reservation statistics for multiple sell orders (DEPRECATED - use enrichSellOrdersWithQuantities).
 * This function is kept for backwards compatibility but doesn't include expiration logic.
 *
 * @deprecated Use enrichSellOrdersWithQuantities instead for proper expiration handling
 * @param sellOrderIds - Array of sell order IDs to fetch stats for
 * @returns Map with sellOrderId -> ReservationStats
 */
export async function getReservationStatsForOrders(
  sellOrderIds: number[]
): Promise<Map<number, ReservationStats>> {
  if (sellOrderIds.length === 0) {
    return new Map()
  }

  // Use SQL now() instead of JavaScript Date to avoid serialization issues
  const reservationStats = await db
    .select({
      sellOrderId: orderReservations.sellOrderId,
      count:
        sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now()))::int`.as(
          'count'
        ),
      quantity:
        sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now())), 0)::int`.as(
          'quantity'
        ),
      fulfilledQuantity:
        sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled'), 0)::int`.as(
          'fulfilled_quantity'
        ),
    })
    .from(orderReservations)
    .where(inArray(orderReservations.sellOrderId, sellOrderIds))
    .groupBy(orderReservations.sellOrderId)

  const statsMap = new Map<number, ReservationStats>()

  for (const stat of reservationStats) {
    if (stat.sellOrderId !== null) {
      statsMap.set(stat.sellOrderId, {
        count: stat.count,
        quantity: stat.quantity,
        fulfilledQuantity: stat.fulfilledQuantity,
      })
    }
  }

  return statsMap
}

/**
 * Get reservation statistics for buy orders with expiration check.
 * Buy orders don't need FIO-aware logic since they're not inventory-backed.
 *
 * @param buyOrderIds - Array of buy order IDs to fetch stats for
 * @returns Map with buyOrderId -> ReservationStats
 */
export async function getReservationStatsForBuyOrders(
  buyOrderIds: number[]
): Promise<Map<number, ReservationStats>> {
  if (buyOrderIds.length === 0) {
    return new Map()
  }

  // Use SQL now() instead of JavaScript Date to avoid serialization issues
  const reservationStats = await db
    .select({
      buyOrderId: orderReservations.buyOrderId,
      count:
        sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now()))::int`.as(
          'count'
        ),
      quantity:
        sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed') and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now())), 0)::int`.as(
          'quantity'
        ),
      fulfilledQuantity:
        sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled' and (${orderReservations.expiresAt} is null or ${orderReservations.expiresAt} > now())), 0)::int`.as(
          'fulfilled_quantity'
        ),
    })
    .from(orderReservations)
    .where(inArray(orderReservations.buyOrderId, buyOrderIds))
    .groupBy(orderReservations.buyOrderId)

  const statsMap = new Map<number, ReservationStats>()

  for (const stat of reservationStats) {
    if (stat.buyOrderId !== null) {
      statsMap.set(stat.buyOrderId, {
        count: stat.count,
        quantity: stat.quantity,
        fulfilledQuantity: stat.fulfilledQuantity,
      })
    }
  }

  return statsMap
}

/**
 * Minimal sell order data required for quantity enrichment
 */
interface SellOrderForEnrichment {
  id: number
  userId: number
  commodityTicker: string
  locationId: string
  limitMode: SellOrderLimitMode
  limitQuantity: number | null
}

/**
 * Enrich sell orders with full quantity information.
 * This is the primary function for calculating availability with proper expiration logic.
 *
 * Expiration rules:
 * - Pending/confirmed reservations: Excluded if expiresAt < now
 * - Fulfilled reservations: Excluded if fioUploadedAt > updatedAt (FIO reflects the sale)
 *   OR if fioUploadedAt is unavailable and expiresAt < now
 *
 * @param orders - Array of sell orders with minimal required fields
 * @returns Map with orderId -> SellOrderQuantityInfo
 */
export async function enrichSellOrdersWithQuantities(
  orders: SellOrderForEnrichment[]
): Promise<Map<number, SellOrderQuantityInfo>> {
  if (orders.length === 0) {
    return new Map()
  }

  // Get unique user IDs and order IDs
  const userIds = [...new Set(orders.map(o => o.userId))]
  const orderIds = orders.map(o => o.id)

  // Fetch inventory, active reservations, and fulfilled reservations in parallel
  const [inventoryMap, activeReservationMap, fulfilledReservationsMap] = await Promise.all([
    getInventoryForUsers(userIds),
    getActiveReservationStatsForSellOrders(orderIds),
    getFulfilledReservationsForSellOrders(orderIds),
  ])

  // Build quantity info for each order
  const quantityMap = new Map<number, SellOrderQuantityInfo>()

  for (const order of orders) {
    const inventoryKey = `${order.userId}:${order.commodityTicker}:${order.locationId}`
    const inventoryInfo = inventoryMap.get(inventoryKey) ?? { quantity: 0, fioUploadedAt: null }
    const activeStats = activeReservationMap.get(order.id) ?? { count: 0, quantity: 0 }
    const fulfilledReservations = fulfilledReservationsMap.get(order.id) ?? []

    // Calculate FIO-aware fulfilled quantity
    const fulfilledQuantity = calculateEffectiveFulfilledQuantity(
      fulfilledReservations,
      inventoryInfo.fioUploadedAt
    )

    const fioQuantity = inventoryInfo.quantity
    const availableQuantity = calculateAvailableQuantity(
      fioQuantity,
      order.limitMode,
      order.limitQuantity
    )
    const remainingQuantity = availableQuantity - activeStats.quantity - fulfilledQuantity

    quantityMap.set(order.id, {
      fioQuantity,
      availableQuantity,
      reservedQuantity: activeStats.quantity,
      fulfilledQuantity,
      remainingQuantity,
      activeReservationCount: activeStats.count,
      fioUploadedAt: inventoryInfo.fioUploadedAt,
    })
  }

  return quantityMap
}
