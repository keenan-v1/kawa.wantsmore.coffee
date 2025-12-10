import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Query,
  Route,
  Security,
  Tags,
  Request,
  SuccessResponse,
} from 'tsoa'
import type {
  ReservationWithDetails,
  CreateSellOrderReservationRequest,
  CreateBuyOrderReservationRequest,
  UpdateReservationStatusRequest,
  ReservationStatus,
  NotificationType,
} from '@kawakawa/types'
import { db, orderReservations, buyOrders, sellOrders, users } from '../db/index.js'
import { eq, or } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { notificationService } from '../services/notificationService.js'
import { hasPermission } from '../utils/permissionService.js'

interface ReservationResponse {
  id: number
  sellOrderId: number | null
  buyOrderId: number | null
  counterpartyUserId: number
  quantity: number
  status: ReservationStatus
  notes: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

@Route('reservations')
@Tags('Reservations')
@Security('jwt')
export class ReservationsController extends Controller {
  /**
   * Get all reservations for the current user (as order owner or counterparty)
   * @param role Filter by role: 'owner' (my orders being reserved), 'counterparty' (my reservations), or 'all'
   * @param status Filter by reservation status
   */
  @Get()
  public async getReservations(
    @Request() request: { user: JwtPayload },
    @Query() role?: 'owner' | 'counterparty' | 'all',
    @Query() status?: ReservationStatus
  ): Promise<ReservationWithDetails[]> {
    const userId = request.user.userId
    const filterRole = role ?? 'all'

    // Get reservations with sell order info (reserving from sell orders)
    const sellOrderReservations = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        orderOwnerUserId: sellOrders.userId,
        commodityTicker: sellOrders.commodityTicker,
        locationId: sellOrders.locationId,
        price: sellOrders.price,
        currency: sellOrders.currency,
      })
      .from(orderReservations)
      .innerJoin(sellOrders, eq(orderReservations.sellOrderId, sellOrders.id))
      .where(
        filterRole === 'owner'
          ? eq(sellOrders.userId, userId)
          : filterRole === 'counterparty'
            ? eq(orderReservations.counterpartyUserId, userId)
            : or(eq(sellOrders.userId, userId), eq(orderReservations.counterpartyUserId, userId))
      )

    // Get reservations with buy order info (filling buy orders)
    const buyOrderReservations = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        orderOwnerUserId: buyOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        price: buyOrders.price,
        currency: buyOrders.currency,
      })
      .from(orderReservations)
      .innerJoin(buyOrders, eq(orderReservations.buyOrderId, buyOrders.id))
      .where(
        filterRole === 'owner'
          ? eq(buyOrders.userId, userId)
          : filterRole === 'counterparty'
            ? eq(orderReservations.counterpartyUserId, userId)
            : or(eq(buyOrders.userId, userId), eq(orderReservations.counterpartyUserId, userId))
      )

    // Combine results
    const allReservations = [...sellOrderReservations, ...buyOrderReservations]

    // Get all user IDs for name lookup
    const allUserIds = [
      ...new Set([
        ...allReservations.map(r => r.orderOwnerUserId),
        ...allReservations.map(r => r.counterpartyUserId),
      ]),
    ]

    const userRows =
      allUserIds.length > 0
        ? await db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(or(...allUserIds.map(id => eq(users.id, id)))!)
        : []

    const userMap = new Map(userRows.map(u => [u.id, u.displayName]))

    // Filter by status if provided and map to response
    let results = allReservations
    if (status) {
      results = results.filter(r => r.status === status)
    }

    // Sort by createdAt descending
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return results.map(r => ({
      id: r.id,
      sellOrderId: r.sellOrderId,
      buyOrderId: r.buyOrderId,
      counterpartyUserId: r.counterpartyUserId,
      quantity: r.quantity,
      status: r.status,
      notes: r.notes,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      orderOwnerName: userMap.get(r.orderOwnerUserId) ?? 'Unknown',
      orderOwnerUserId: r.orderOwnerUserId,
      counterpartyName: userMap.get(r.counterpartyUserId) ?? 'Unknown',
      commodityTicker: r.commodityTicker,
      locationId: r.locationId,
      price: parseFloat(r.price),
      currency: r.currency,
      isOrderOwner: r.orderOwnerUserId === userId,
      isCounterparty: r.counterpartyUserId === userId,
    }))
  }

  /**
   * Get a specific reservation by ID
   */
  @Get('{id}')
  public async getReservation(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationWithDetails> {
    const userId = request.user.userId

    // Try to find as sell order reservation
    const sellResults = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        orderOwnerUserId: sellOrders.userId,
        commodityTicker: sellOrders.commodityTicker,
        locationId: sellOrders.locationId,
        price: sellOrders.price,
        currency: sellOrders.currency,
      })
      .from(orderReservations)
      .innerJoin(sellOrders, eq(orderReservations.sellOrderId, sellOrders.id))
      .where(eq(orderReservations.id, id))

    // Try to find as buy order reservation
    const buyResults = await db
      .select({
        id: orderReservations.id,
        sellOrderId: orderReservations.sellOrderId,
        buyOrderId: orderReservations.buyOrderId,
        counterpartyUserId: orderReservations.counterpartyUserId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        orderOwnerUserId: buyOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        price: buyOrders.price,
        currency: buyOrders.currency,
      })
      .from(orderReservations)
      .innerJoin(buyOrders, eq(orderReservations.buyOrderId, buyOrders.id))
      .where(eq(orderReservations.id, id))

    const r = sellResults[0] || buyResults[0]
    if (!r) {
      throw NotFound('Reservation not found')
    }

    // Only order owner or counterparty can view
    if (r.orderOwnerUserId !== userId && r.counterpartyUserId !== userId) {
      throw Forbidden('You do not have access to this reservation')
    }

    // Get user names
    const userRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(or(eq(users.id, r.orderOwnerUserId), eq(users.id, r.counterpartyUserId))!)

    const userMap = new Map(userRows.map(u => [u.id, u.displayName]))

    return {
      id: r.id,
      sellOrderId: r.sellOrderId,
      buyOrderId: r.buyOrderId,
      counterpartyUserId: r.counterpartyUserId,
      quantity: r.quantity,
      status: r.status,
      notes: r.notes,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      orderOwnerName: userMap.get(r.orderOwnerUserId) ?? 'Unknown',
      orderOwnerUserId: r.orderOwnerUserId,
      counterpartyName: userMap.get(r.counterpartyUserId) ?? 'Unknown',
      commodityTicker: r.commodityTicker,
      locationId: r.locationId,
      price: parseFloat(r.price),
      currency: r.currency,
      isOrderOwner: r.orderOwnerUserId === userId,
      isCounterparty: r.counterpartyUserId === userId,
    }
  }

  /**
   * Create a reservation against a sell order (user wants to buy)
   */
  @Post('sell-order')
  @SuccessResponse(201, 'Reservation created')
  public async createSellOrderReservation(
    @Body() body: CreateSellOrderReservationRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    const userId = request.user.userId

    // Verify the sell order exists
    const [sellOrder] = await db
      .select()
      .from(sellOrders)
      .where(eq(sellOrders.id, body.sellOrderId))

    if (!sellOrder) {
      throw NotFound('Sell order not found')
    }

    // Cannot reserve from your own sell order
    if (sellOrder.userId === userId) {
      throw BadRequest('You cannot create a reservation against your own sell order')
    }

    // Check permission based on order type
    const userRoles = request.user.roles
    const requiredPermission =
      sellOrder.orderType === 'internal'
        ? 'reservations.place_internal'
        : 'reservations.place_partner'

    if (!(await hasPermission(userRoles, requiredPermission))) {
      throw Forbidden(
        `You do not have permission to place reservations on ${sellOrder.orderType} orders`
      )
    }

    // Validate quantity
    if (body.quantity <= 0) {
      throw BadRequest('Quantity must be greater than 0')
    }

    // Create the reservation
    const [reservation] = await db
      .insert(orderReservations)
      .values({
        sellOrderId: body.sellOrderId,
        buyOrderId: null,
        counterpartyUserId: userId,
        quantity: body.quantity,
        status: 'pending',
        notes: body.notes ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning()

    this.setStatus(201)

    // Notify the seller
    const [buyer] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))

    await notificationService.create(
      sellOrder.userId,
      'reservation_placed',
      'New Reservation',
      `${buyer?.displayName ?? 'Someone'} wants ${body.quantity} ${sellOrder.commodityTicker}`,
      {
        reservationId: reservation.id,
        sellOrderId: body.sellOrderId,
        counterpartyUserId: userId,
        quantity: body.quantity,
        commodityTicker: sellOrder.commodityTicker,
        locationId: sellOrder.locationId,
      }
    )

    return {
      id: reservation.id,
      sellOrderId: reservation.sellOrderId,
      buyOrderId: reservation.buyOrderId,
      counterpartyUserId: reservation.counterpartyUserId,
      quantity: reservation.quantity,
      status: reservation.status,
      notes: reservation.notes,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    }
  }

  /**
   * Create a reservation against a buy order (user wants to sell/fill)
   */
  @Post('buy-order')
  @SuccessResponse(201, 'Reservation created')
  public async createBuyOrderReservation(
    @Body() body: CreateBuyOrderReservationRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    const userId = request.user.userId

    // Verify the buy order exists
    const [buyOrder] = await db.select().from(buyOrders).where(eq(buyOrders.id, body.buyOrderId))

    if (!buyOrder) {
      throw NotFound('Buy order not found')
    }

    // Cannot fill your own buy order
    if (buyOrder.userId === userId) {
      throw BadRequest('You cannot create a reservation against your own buy order')
    }

    // Check permission based on order type
    const userRoles = request.user.roles
    const requiredPermission =
      buyOrder.orderType === 'internal'
        ? 'reservations.place_internal'
        : 'reservations.place_partner'

    if (!(await hasPermission(userRoles, requiredPermission))) {
      throw Forbidden(
        `You do not have permission to place reservations on ${buyOrder.orderType} orders`
      )
    }

    // Validate quantity
    if (body.quantity <= 0) {
      throw BadRequest('Quantity must be greater than 0')
    }

    // Create the reservation
    const [reservation] = await db
      .insert(orderReservations)
      .values({
        sellOrderId: null,
        buyOrderId: body.buyOrderId,
        counterpartyUserId: userId,
        quantity: body.quantity,
        status: 'pending',
        notes: body.notes ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      })
      .returning()

    this.setStatus(201)

    // Notify the buyer (order owner)
    const [seller] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))

    await notificationService.create(
      buyOrder.userId,
      'reservation_placed',
      'Order Fill Request',
      `${seller?.displayName ?? 'Someone'} can fill ${body.quantity} ${buyOrder.commodityTicker}`,
      {
        reservationId: reservation.id,
        buyOrderId: body.buyOrderId,
        counterpartyUserId: userId,
        quantity: body.quantity,
        commodityTicker: buyOrder.commodityTicker,
        locationId: buyOrder.locationId,
      }
    )

    return {
      id: reservation.id,
      sellOrderId: reservation.sellOrderId,
      buyOrderId: reservation.buyOrderId,
      counterpartyUserId: reservation.counterpartyUserId,
      quantity: reservation.quantity,
      status: reservation.status,
      notes: reservation.notes,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    }
  }

  /**
   * Confirm a reservation (order owner only)
   */
  @Put('{id}/confirm')
  @SuccessResponse(200, 'Reservation confirmed')
  public async confirmReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'confirmed', request.user.userId, body.notes, 'owner')
  }

  /**
   * Reject a reservation (order owner only)
   */
  @Put('{id}/reject')
  @SuccessResponse(200, 'Reservation rejected')
  public async rejectReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'rejected', request.user.userId, body.notes, 'owner')
  }

  /**
   * Mark a reservation as fulfilled (either party)
   */
  @Put('{id}/fulfill')
  @SuccessResponse(200, 'Reservation fulfilled')
  public async fulfillReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'fulfilled', request.user.userId, body.notes, 'either')
  }

  /**
   * Cancel a reservation (counterparty can cancel pending, owner can cancel any)
   */
  @Put('{id}/cancel')
  @SuccessResponse(200, 'Reservation cancelled')
  public async cancelReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'cancelled', request.user.userId, body.notes, 'either')
  }

  /**
   * Reopen a cancelled reservation (counterparty only)
   */
  @Put('{id}/reopen')
  @SuccessResponse(200, 'Reservation reopened')
  public async reopenReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(
      id,
      'pending',
      request.user.userId,
      body.notes,
      'counterparty'
    )
  }

  /**
   * Delete a reservation (counterparty only, if pending)
   */
  @Delete('{id}')
  @SuccessResponse(204, 'Reservation deleted')
  public async deleteReservation(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    // Get the reservation
    const [reservation] = await db
      .select()
      .from(orderReservations)
      .where(eq(orderReservations.id, id))

    if (!reservation) {
      throw NotFound('Reservation not found')
    }

    // Only counterparty can delete, and only if pending
    if (reservation.counterpartyUserId !== userId) {
      throw Forbidden('Only the person who created the reservation can delete it')
    }

    if (reservation.status !== 'pending') {
      throw BadRequest('Only pending reservations can be deleted')
    }

    await db.delete(orderReservations).where(eq(orderReservations.id, id))

    this.setStatus(204)
  }

  /**
   * Helper method to update reservation status with proper authorization and notifications
   */
  private async updateReservationStatus(
    id: number,
    newStatus: ReservationStatus,
    userId: number,
    notes: string | undefined,
    allowedRole: 'owner' | 'counterparty' | 'either'
  ): Promise<ReservationResponse> {
    // Get the reservation
    const [reservation] = await db
      .select()
      .from(orderReservations)
      .where(eq(orderReservations.id, id))

    if (!reservation) {
      throw NotFound('Reservation not found')
    }

    // Get order owner info
    let orderOwnerUserId: number
    let commodityTicker: string
    let locationId: string

    if (reservation.sellOrderId) {
      const [sellOrder] = await db
        .select()
        .from(sellOrders)
        .where(eq(sellOrders.id, reservation.sellOrderId))
      if (!sellOrder) throw NotFound('Associated sell order not found')
      orderOwnerUserId = sellOrder.userId
      commodityTicker = sellOrder.commodityTicker
      locationId = sellOrder.locationId
    } else if (reservation.buyOrderId) {
      const [buyOrder] = await db
        .select()
        .from(buyOrders)
        .where(eq(buyOrders.id, reservation.buyOrderId))
      if (!buyOrder) throw NotFound('Associated buy order not found')
      orderOwnerUserId = buyOrder.userId
      commodityTicker = buyOrder.commodityTicker
      locationId = buyOrder.locationId
    } else {
      throw BadRequest('Reservation has no associated order')
    }

    const isOrderOwner = orderOwnerUserId === userId
    const isCounterparty = reservation.counterpartyUserId === userId

    // Check authorization
    if (allowedRole === 'owner' && !isOrderOwner) {
      throw Forbidden('Only the order owner can perform this action')
    }
    if (allowedRole === 'counterparty' && !isCounterparty) {
      throw Forbidden('Only the person who created the reservation can perform this action')
    }
    if (allowedRole === 'either' && !isOrderOwner && !isCounterparty) {
      throw Forbidden('You do not have access to this reservation')
    }

    // Validate status transition
    const validTransitions: Record<ReservationStatus, ReservationStatus[]> = {
      pending: ['confirmed', 'rejected', 'cancelled'],
      confirmed: ['fulfilled', 'cancelled'],
      rejected: [],
      fulfilled: [],
      expired: [],
      cancelled: ['pending'], // Allow reopening cancelled reservations
    }

    if (!validTransitions[reservation.status].includes(newStatus)) {
      throw BadRequest(`Cannot transition from '${reservation.status}' to '${newStatus}'`)
    }

    // Update the reservation
    const [updated] = await db
      .update(orderReservations)
      .set({
        status: newStatus,
        notes: notes ?? reservation.notes,
        updatedAt: new Date(),
      })
      .where(eq(orderReservations.id, id))
      .returning()

    // Send notification to the other party
    const [actor] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))

    const actorName = actor?.displayName ?? 'Someone'
    const otherPartyId = isOrderOwner ? reservation.counterpartyUserId : orderOwnerUserId

    const notificationTypes: Record<
      ReservationStatus,
      { type: NotificationType; title: string; getMessage: (name: string) => string }
    > = {
      pending: {
        type: 'reservation_placed',
        title: 'New Reservation',
        getMessage: n => `${n} created a reservation`,
      },
      confirmed: {
        type: 'reservation_confirmed',
        title: 'Confirmed',
        getMessage: n => `${n} confirmed ${reservation.quantity} ${commodityTicker}`,
      },
      rejected: {
        type: 'reservation_rejected',
        title: 'Rejected',
        getMessage: n => `${n} rejected ${reservation.quantity} ${commodityTicker}`,
      },
      fulfilled: {
        type: 'reservation_fulfilled',
        title: 'Fulfilled',
        getMessage: n => `${n} fulfilled ${reservation.quantity} ${commodityTicker}`,
      },
      cancelled: {
        type: 'reservation_cancelled',
        title: 'Cancelled',
        getMessage: n => `${n} cancelled ${reservation.quantity} ${commodityTicker}`,
      },
      expired: {
        type: 'reservation_expired',
        title: 'Expired',
        getMessage: () => `${reservation.quantity} ${commodityTicker} reservation expired`,
      },
    }

    const notifConfig = notificationTypes[newStatus]
    await notificationService.create(
      otherPartyId,
      notifConfig.type,
      notifConfig.title,
      notifConfig.getMessage(actorName),
      {
        reservationId: id,
        sellOrderId: reservation.sellOrderId,
        buyOrderId: reservation.buyOrderId,
        quantity: reservation.quantity,
        commodityTicker,
        locationId,
      }
    )

    return {
      id: updated.id,
      sellOrderId: updated.sellOrderId,
      buyOrderId: updated.buyOrderId,
      counterpartyUserId: updated.counterpartyUserId,
      quantity: updated.quantity,
      status: updated.status,
      notes: updated.notes,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }
  }
}
