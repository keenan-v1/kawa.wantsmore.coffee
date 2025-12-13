import { db, fioInventory, fioUserStorage, orderReservations } from '@kawakawa/db'
import { eq, inArray, sql } from 'drizzle-orm'
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
 * Get reservation statistics for multiple sell orders.
 * Returns counts and quantities for active (pending/confirmed) and fulfilled reservations.
 *
 * @param sellOrderIds - Array of sell order IDs to fetch stats for
 * @returns Map with sellOrderId -> ReservationStats
 */
export async function getReservationStatsForOrders(
  sellOrderIds: number[]
): Promise<Map<number, ReservationStats>> {
  if (sellOrderIds.length === 0) {
    return new Map()
  }

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
 * This is a convenience function that combines inventory and reservation lookups.
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

  // Fetch inventory and reservations in parallel
  const [inventoryMap, reservationMap] = await Promise.all([
    getInventoryForUsers(userIds),
    getReservationStatsForOrders(orderIds),
  ])

  // Build quantity info for each order
  const quantityMap = new Map<number, SellOrderQuantityInfo>()

  for (const order of orders) {
    const inventoryKey = `${order.userId}:${order.commodityTicker}:${order.locationId}`
    const inventoryInfo = inventoryMap.get(inventoryKey) ?? { quantity: 0, fioUploadedAt: null }
    const reservationStats = reservationMap.get(order.id) ?? {
      count: 0,
      quantity: 0,
      fulfilledQuantity: 0,
    }

    const fioQuantity = inventoryInfo.quantity
    const availableQuantity = calculateAvailableQuantity(
      fioQuantity,
      order.limitMode,
      order.limitQuantity
    )
    const remainingQuantity = Math.max(
      0,
      availableQuantity - reservationStats.quantity - reservationStats.fulfilledQuantity
    )

    quantityMap.set(order.id, {
      fioQuantity,
      availableQuantity,
      reservedQuantity: reservationStats.quantity,
      fulfilledQuantity: reservationStats.fulfilledQuantity,
      remainingQuantity,
      activeReservationCount: reservationStats.count,
      fioUploadedAt: inventoryInfo.fioUploadedAt,
    })
  }

  return quantityMap
}
