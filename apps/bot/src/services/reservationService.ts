/**
 * Reservation Service for Discord Bot
 * Shared logic for /reserve and /fill commands
 */
import { db, sellOrders, buyOrders, orderReservations, users } from '@kawakawa/db'
import { eq, and, ne, desc, sql, inArray } from 'drizzle-orm'
import { enrichSellOrdersWithQuantities, getOrderDisplayPrice } from '@kawakawa/services/market'
import { formatLocation } from './locationService.js'
import { getFioUsernames } from './userSettings.js'
import type { LocationDisplayMode, Currency } from '@kawakawa/types'

/**
 * Reservation status values
 */
export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'fulfilled'
  | 'expired'
  | 'cancelled'

/**
 * Order type for select menu
 */
export interface SelectableOrder {
  id: number
  type: 'sell' | 'buy'
  commodityTicker: string
  locationId: string
  price: string
  currency: Currency
  priceListCode: string | null
  orderType: string
  ownerId: number
  ownerUsername: string
  ownerDisplayName: string | null
  ownerFioUsername: string | null
  quantity: number // For buy orders: requested qty, for sell: remaining qty
}

/**
 * Get available sell orders for a commodity (excluding user's own orders)
 * Returns orders with remaining quantity > 0
 */
export async function getAvailableSellOrders(
  commodityTicker: string,
  locationId: string | null,
  excludeUserId: number
): Promise<SelectableOrder[]> {
  // Query sell orders matching filters
  const ordersData = await db.query.sellOrders.findMany({
    where: and(
      eq(sellOrders.commodityTicker, commodityTicker),
      locationId ? eq(sellOrders.locationId, locationId) : undefined,
      ne(sellOrders.userId, excludeUserId)
    ),
    with: {
      user: true,
      commodity: true,
      location: true,
    },
    orderBy: [desc(sellOrders.updatedAt)],
  })

  if (ordersData.length === 0) {
    return []
  }

  // Enrich with quantity information
  const quantityInfo = await enrichSellOrdersWithQuantities(
    ordersData.map(o => ({
      id: o.id,
      userId: o.userId,
      commodityTicker: o.commodityTicker,
      locationId: o.locationId,
      limitMode: o.limitMode,
      limitQuantity: o.limitQuantity,
    }))
  )

  // Get FIO usernames for all order owners
  const userIds = [...new Set(ordersData.map(o => o.userId))]
  const fioUsernameMap = await getFioUsernames(userIds)

  // Filter to orders with remaining quantity and format
  const result: SelectableOrder[] = []

  for (const order of ordersData) {
    const qty = quantityInfo.get(order.id)
    if (!qty || qty.remainingQuantity <= 0) continue

    result.push({
      id: order.id,
      type: 'sell',
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
      price: order.price,
      currency: order.currency,
      priceListCode: order.priceListCode,
      orderType: order.orderType,
      ownerId: order.userId,
      ownerUsername: order.user.username,
      ownerDisplayName: order.user.displayName,
      ownerFioUsername: fioUsernameMap.get(order.userId) ?? null,
      quantity: qty.remainingQuantity,
    })
  }

  return result
}

/**
 * Get reservation stats for buy orders
 * Returns count and total quantity of active (pending/confirmed) reservations
 */
async function getBuyOrderReservationStats(
  buyOrderIds: number[]
): Promise<Map<number, { count: number; quantity: number; fulfilledQuantity: number }>> {
  if (buyOrderIds.length === 0) {
    return new Map()
  }

  const stats = await db
    .select({
      buyOrderId: orderReservations.buyOrderId,
      count: sql<number>`count(*) filter (where ${orderReservations.status} in ('pending', 'confirmed'))::int`,
      quantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} in ('pending', 'confirmed')), 0)::int`,
      fulfilledQuantity: sql<number>`coalesce(sum(${orderReservations.quantity}) filter (where ${orderReservations.status} = 'fulfilled'), 0)::int`,
    })
    .from(orderReservations)
    .where(inArray(orderReservations.buyOrderId, buyOrderIds))
    .groupBy(orderReservations.buyOrderId)

  const result = new Map<number, { count: number; quantity: number; fulfilledQuantity: number }>()
  for (const stat of stats) {
    if (stat.buyOrderId !== null) {
      result.set(stat.buyOrderId, {
        count: stat.count,
        quantity: stat.quantity,
        fulfilledQuantity: stat.fulfilledQuantity,
      })
    }
  }

  return result
}

/**
 * Get available buy orders for a commodity (excluding user's own orders)
 * Returns orders with unfilled quantity > 0
 */
export async function getAvailableBuyOrders(
  commodityTicker: string,
  locationId: string | null,
  excludeUserId: number
): Promise<SelectableOrder[]> {
  // Query buy orders matching filters
  const ordersData = await db.query.buyOrders.findMany({
    where: and(
      eq(buyOrders.commodityTicker, commodityTicker),
      locationId ? eq(buyOrders.locationId, locationId) : undefined,
      ne(buyOrders.userId, excludeUserId)
    ),
    with: {
      user: true,
      commodity: true,
      location: true,
    },
    orderBy: [desc(buyOrders.updatedAt)],
  })

  if (ordersData.length === 0) {
    return []
  }

  // Get reservation stats for these orders
  const orderIds = ordersData.map(o => o.id)
  const reservationStats = await getBuyOrderReservationStats(orderIds)

  // Get FIO usernames for all order owners
  const userIds = [...new Set(ordersData.map(o => o.userId))]
  const fioUsernameMap = await getFioUsernames(userIds)

  // Filter to orders with remaining quantity and format
  const result: SelectableOrder[] = []

  for (const order of ordersData) {
    const stats = reservationStats.get(order.id) ?? { count: 0, quantity: 0, fulfilledQuantity: 0 }
    const remainingQuantity = Math.max(
      0,
      order.quantity - stats.quantity - stats.fulfilledQuantity
    )
    if (remainingQuantity <= 0) continue

    result.push({
      id: order.id,
      type: 'buy',
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
      price: order.price,
      currency: order.currency,
      priceListCode: order.priceListCode,
      orderType: order.orderType,
      ownerId: order.userId,
      ownerUsername: order.user.username,
      ownerDisplayName: order.user.displayName,
      ownerFioUsername: fioUsernameMap.get(order.userId) ?? null,
      quantity: remainingQuantity,
    })
  }

  return result
}


/**
 * Format an order for Discord select menu option
 */
export async function formatOrderForSelect(
  order: SelectableOrder,
  locationDisplayMode: LocationDisplayMode
): Promise<{ label: string; value: string; description: string }> {
  const location = await formatLocation(order.locationId, locationDisplayMode)
  const ownerName = order.ownerFioUsername ?? order.ownerDisplayName ?? order.ownerUsername

  // Resolve price from price list if needed
  const priceInfo = await getOrderDisplayPrice({
    price: order.price,
    currency: order.currency,
    priceListCode: order.priceListCode,
    commodityTicker: order.commodityTicker,
    locationId: order.locationId,
  })
  const displayPrice = priceInfo
    ? `${priceInfo.price.toFixed(2)} ${priceInfo.currency}`
    : `${order.price} ${order.currency}`

  if (order.type === 'sell') {
    return {
      label: `${order.commodityTicker} @ ${location} (${order.quantity} avail)`,
      value: `sell:${order.id}`,
      description: `${displayPrice} from ${ownerName}`,
    }
  } else {
    return {
      label: `${order.commodityTicker} @ ${location} (${order.quantity} wanted)`,
      value: `buy:${order.id}`,
      description: `${displayPrice} by ${ownerName}`,
    }
  }
}

/**
 * Create a reservation for an order
 */
export async function createReservation(
  type: 'sell' | 'buy',
  orderId: number,
  counterpartyUserId: number,
  quantity: number,
  notes?: string
): Promise<{ id: number }> {
  // Default expiration: 3 days from now
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

  const [reservation] = await db
    .insert(orderReservations)
    .values({
      sellOrderId: type === 'sell' ? orderId : null,
      buyOrderId: type === 'buy' ? orderId : null,
      counterpartyUserId,
      quantity,
      status: 'pending',
      notes: notes || null,
      expiresAt,
    })
    .returning({ id: orderReservations.id })

  return reservation
}

/**
 * Reservation with full order and user details for display
 */
export interface ReservationWithDetails {
  id: number
  type: 'sell' | 'buy'
  orderId: number
  commodityTicker: string
  locationId: string
  price: string
  currency: string
  priceListCode: string | null
  quantity: number
  status: ReservationStatus
  notes: string | null
  expiresAt: Date | null
  createdAt: Date
  // Order owner info
  ownerId: number
  ownerUsername: string
  ownerDisplayName: string | null
  ownerFioUsername: string | null
  // Counterparty (reservation creator) info
  counterpartyId: number
  counterpartyUsername: string
  counterpartyDisplayName: string | null
  counterpartyFioUsername: string | null
}

/**
 * Get reservations for a user (as order owner or counterparty)
 */
export async function getReservationsForUser(
  userId: number,
  statusFilter?: ReservationStatus | 'all'
): Promise<ReservationWithDetails[]> {
  // Build status condition
  const statusCondition =
    statusFilter && statusFilter !== 'all' ? eq(orderReservations.status, statusFilter) : undefined

  // Get all reservations where user is involved
  const reservations = await db.query.orderReservations.findMany({
    where: statusCondition,
    orderBy: [desc(orderReservations.createdAt)],
  })

  if (reservations.length === 0) {
    return []
  }

  // Collect all order IDs
  const sellOrderIds = reservations
    .filter(r => r.sellOrderId !== null)
    .map(r => r.sellOrderId as number)
  const buyOrderIds = reservations
    .filter(r => r.buyOrderId !== null)
    .map(r => r.buyOrderId as number)

  // Fetch orders
  const [sellOrdersData, buyOrdersData] = await Promise.all([
    sellOrderIds.length > 0
      ? db.query.sellOrders.findMany({
          where: inArray(sellOrders.id, sellOrderIds),
          with: { user: true },
        })
      : [],
    buyOrderIds.length > 0
      ? db.query.buyOrders.findMany({
          where: inArray(buyOrders.id, buyOrderIds),
          with: { user: true },
        })
      : [],
  ])

  const sellOrderMap = new Map(sellOrdersData.map(o => [o.id, o]))
  const buyOrderMap = new Map(buyOrdersData.map(o => [o.id, o]))

  // Get all counterparty user info
  const counterpartyIds = [...new Set(reservations.map(r => r.counterpartyUserId))]
  const counterparties = await db.query.users.findMany({
    where: inArray(users.id, counterpartyIds),
  })
  const counterpartyMap = new Map(counterparties.map(u => [u.id, u]))

  // Get FIO usernames for all involved users
  const allUserIds = [
    ...new Set([
      ...sellOrdersData.map(o => o.userId),
      ...buyOrdersData.map(o => o.userId),
      ...counterpartyIds,
    ]),
  ]
  const fioUsernameMap = await getFioUsernames(allUserIds)

  // Build result, filtering to only reservations involving this user
  const result: ReservationWithDetails[] = []

  for (const reservation of reservations) {
    let order
    let type: 'sell' | 'buy'

    if (reservation.sellOrderId) {
      order = sellOrderMap.get(reservation.sellOrderId)
      type = 'sell'
    } else if (reservation.buyOrderId) {
      order = buyOrderMap.get(reservation.buyOrderId)
      type = 'buy'
    } else {
      continue
    }

    if (!order) continue

    // Filter: user must be either order owner or counterparty
    const isOwner = order.userId === userId
    const isCounterparty = reservation.counterpartyUserId === userId
    if (!isOwner && !isCounterparty) continue

    const counterparty = counterpartyMap.get(reservation.counterpartyUserId)
    if (!counterparty) continue

    result.push({
      id: reservation.id,
      type,
      orderId: order.id,
      commodityTicker: order.commodityTicker,
      locationId: order.locationId,
      price: order.price,
      currency: order.currency,
      priceListCode: order.priceListCode,
      quantity: reservation.quantity,
      status: reservation.status as ReservationStatus,
      notes: reservation.notes,
      expiresAt: reservation.expiresAt,
      createdAt: reservation.createdAt,
      ownerId: order.userId,
      ownerUsername: order.user.username,
      ownerDisplayName: order.user.displayName,
      ownerFioUsername: fioUsernameMap.get(order.userId) ?? null,
      counterpartyId: reservation.counterpartyUserId,
      counterpartyUsername: counterparty.username,
      counterpartyDisplayName: counterparty.displayName,
      counterpartyFioUsername: fioUsernameMap.get(reservation.counterpartyUserId) ?? null,
    })
  }

  return result
}

/**
 * Update reservation status
 */
export async function updateReservationStatus(
  reservationId: number,
  userId: number,
  newStatus: ReservationStatus,
  isOwner: boolean
): Promise<{ success: boolean; error?: string }> {
  // Get the reservation
  const reservation = await db.query.orderReservations.findFirst({
    where: eq(orderReservations.id, reservationId),
  })

  if (!reservation) {
    return { success: false, error: 'Reservation not found.' }
  }

  // Get the associated order to verify ownership
  let orderId: number | null = null
  let orderOwnerId: number | null = null

  if (reservation.sellOrderId) {
    const order = await db.query.sellOrders.findFirst({
      where: eq(sellOrders.id, reservation.sellOrderId),
    })
    if (order) {
      orderId = order.id
      orderOwnerId = order.userId
    }
  } else if (reservation.buyOrderId) {
    const order = await db.query.buyOrders.findFirst({
      where: eq(buyOrders.id, reservation.buyOrderId),
    })
    if (order) {
      orderId = order.id
      orderOwnerId = order.userId
    }
  }

  if (!orderId || !orderOwnerId) {
    return { success: false, error: 'Associated order not found.' }
  }

  // Verify user can perform this action
  const userIsOwner = orderOwnerId === userId
  const userIsCounterparty = reservation.counterpartyUserId === userId

  if (!userIsOwner && !userIsCounterparty) {
    return { success: false, error: 'You are not authorized to modify this reservation.' }
  }

  // Validate state transitions
  const currentStatus = reservation.status as ReservationStatus
  const validTransitions: Record<ReservationStatus, { owner: ReservationStatus[]; counterparty: ReservationStatus[] }> = {
    pending: {
      owner: ['confirmed', 'rejected', 'fulfilled'],
      counterparty: ['cancelled', 'fulfilled'],
    },
    confirmed: {
      owner: ['fulfilled', 'cancelled'],
      counterparty: ['fulfilled', 'cancelled'],
    },
    rejected: {
      owner: [],
      counterparty: [],
    },
    fulfilled: {
      owner: [],
      counterparty: [],
    },
    expired: {
      owner: [],
      counterparty: [],
    },
    cancelled: {
      owner: [],
      counterparty: ['pending'], // Counterparty can reopen
    },
  }

  const allowedStatuses = userIsOwner
    ? validTransitions[currentStatus].owner
    : validTransitions[currentStatus].counterparty

  if (!allowedStatuses.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot change status from ${currentStatus} to ${newStatus}.`,
    }
  }

  // Update the reservation
  await db
    .update(orderReservations)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(orderReservations.id, reservationId))

  return { success: true }
}

/**
 * Get status emoji for display
 */
export function getStatusEmoji(status: ReservationStatus): string {
  switch (status) {
    case 'pending':
      return '⏳'
    case 'confirmed':
      return '✅'
    case 'rejected':
      return '❌'
    case 'fulfilled':
      return '🎉'
    case 'expired':
      return '⏰'
    case 'cancelled':
      return '🚫'
    default:
      return '❓'
  }
}

/**
 * Format a reservation for display in embed field
 */
export async function formatReservationForEmbed(
  reservation: ReservationWithDetails,
  viewerId: number,
  locationDisplayMode: LocationDisplayMode
): Promise<{ name: string; value: string }> {
  const location = await formatLocation(reservation.locationId, locationDisplayMode)
  const statusEmoji = getStatusEmoji(reservation.status)
  const isOwner = reservation.ownerId === viewerId
  const isCounterparty = reservation.counterpartyId === viewerId

  const ownerName =
    reservation.ownerFioUsername ?? reservation.ownerDisplayName ?? reservation.ownerUsername
  const counterpartyName =
    reservation.counterpartyFioUsername ??
    reservation.counterpartyDisplayName ??
    reservation.counterpartyUsername

  // Resolve price from price list if needed
  const priceInfo = await getOrderDisplayPrice({
    price: reservation.price,
    currency: reservation.currency as Currency,
    priceListCode: reservation.priceListCode,
    commodityTicker: reservation.commodityTicker,
    locationId: reservation.locationId,
  })

  const displayPrice = priceInfo ? priceInfo.price.toFixed(2) : reservation.price
  const displayCurrency = priceInfo ? priceInfo.currency : reservation.currency

  let description = ''
  if (reservation.type === 'sell') {
    description = `📤 SELL ${reservation.quantity}x ${reservation.commodityTicker} @ ${location}`
    if (!isOwner) {
      description += `\nFrom: **${ownerName}**`
    }
    if (!isCounterparty) {
      description += `\nBuyer: **${counterpartyName}**`
    }
  } else {
    description = `📥 BUY ${reservation.quantity}x ${reservation.commodityTicker} @ ${location}`
    if (!isOwner) {
      description += `\nBuyer: **${ownerName}**`
    }
    if (!isCounterparty) {
      description += `\nSeller: **${counterpartyName}**`
    }
  }

  description += `\nPrice: ${displayPrice} ${displayCurrency}`
  description += `\nStatus: ${statusEmoji} ${reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1)}`

  if (reservation.notes) {
    description += `\nNotes: *${reservation.notes}*`
  }

  return {
    name: `#${reservation.id}`,
    value: description,
  }
}
