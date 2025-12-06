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
  CreateReservationRequest,
  UpdateReservationStatusRequest,
  ReservationStatus,
  NotificationType,
} from '@kawakawa/types'
import { db, orderReservations, buyOrders, sellOrders, users } from '../db/index.js'
import { eq, or, desc } from 'drizzle-orm'
import type { JwtPayload } from '../utils/jwt.js'
import { BadRequest, NotFound, Forbidden } from '../utils/errors.js'
import { notificationService } from '../services/notificationService.js'
import { hasPermission } from '../utils/permissionService.js'

interface ReservationResponse {
  id: number
  buyOrderId: number
  sellOrderId: number
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
   * Get all reservations for the current user (as buyer or seller)
   * @param role Filter by role: 'buyer', 'seller', or 'all' (default)
   * @param status Filter by reservation status
   */
  @Get()
  public async getReservations(
    @Request() request: { user: JwtPayload },
    @Query() role?: 'buyer' | 'seller' | 'all',
    @Query() status?: ReservationStatus
  ): Promise<ReservationWithDetails[]> {
    const userId = request.user.userId
    const filterRole = role ?? 'all'

    // Build the query with joins to get all related data
    const results = await db
      .select({
        id: orderReservations.id,
        buyOrderId: orderReservations.buyOrderId,
        sellOrderId: orderReservations.sellOrderId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        buyerUserId: buyOrders.userId,
        sellerUserId: sellOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        buyOrderPrice: buyOrders.price,
        sellOrderPrice: sellOrders.price,
        currency: buyOrders.currency,
      })
      .from(orderReservations)
      .innerJoin(buyOrders, eq(orderReservations.buyOrderId, buyOrders.id))
      .innerJoin(sellOrders, eq(orderReservations.sellOrderId, sellOrders.id))
      .where(
        filterRole === 'buyer'
          ? eq(buyOrders.userId, userId)
          : filterRole === 'seller'
            ? eq(sellOrders.userId, userId)
            : or(eq(buyOrders.userId, userId), eq(sellOrders.userId, userId))
      )
      .orderBy(desc(orderReservations.createdAt))

    // Get user names
    const buyerIds = [...new Set(results.map(r => r.buyerUserId))]
    const sellerIds = [...new Set(results.map(r => r.sellerUserId))]
    const allUserIds = [...new Set([...buyerIds, ...sellerIds])]

    const userRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(
        or(...allUserIds.map(id => eq(users.id, id))) ?? eq(users.id, -1) // Fallback that won't match
      )

    const userMap = new Map(userRows.map(u => [u.id, u.displayName]))

    // Filter by status if provided
    let filteredResults = results
    if (status) {
      filteredResults = results.filter(r => r.status === status)
    }

    return filteredResults.map(r => ({
      id: r.id,
      buyOrderId: r.buyOrderId,
      sellOrderId: r.sellOrderId,
      quantity: r.quantity,
      status: r.status,
      notes: r.notes,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      buyerName: userMap.get(r.buyerUserId) ?? 'Unknown',
      sellerName: userMap.get(r.sellerUserId) ?? 'Unknown',
      commodityTicker: r.commodityTicker,
      locationId: r.locationId,
      buyOrderPrice: parseFloat(r.buyOrderPrice),
      sellOrderPrice: parseFloat(r.sellOrderPrice),
      currency: r.currency,
      isBuyer: r.buyerUserId === userId,
      isSeller: r.sellerUserId === userId,
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

    const results = await db
      .select({
        id: orderReservations.id,
        buyOrderId: orderReservations.buyOrderId,
        sellOrderId: orderReservations.sellOrderId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        buyerUserId: buyOrders.userId,
        sellerUserId: sellOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
        buyOrderPrice: buyOrders.price,
        sellOrderPrice: sellOrders.price,
        currency: buyOrders.currency,
      })
      .from(orderReservations)
      .innerJoin(buyOrders, eq(orderReservations.buyOrderId, buyOrders.id))
      .innerJoin(sellOrders, eq(orderReservations.sellOrderId, sellOrders.id))
      .where(eq(orderReservations.id, id))

    if (results.length === 0) {
      throw NotFound('Reservation not found')
    }

    const r = results[0]

    // Only buyer or seller can view the reservation
    if (r.buyerUserId !== userId && r.sellerUserId !== userId) {
      throw Forbidden('You do not have access to this reservation')
    }

    // Get user names
    const userRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(or(eq(users.id, r.buyerUserId), eq(users.id, r.sellerUserId))!)

    const userMap = new Map(userRows.map(u => [u.id, u.displayName]))

    return {
      id: r.id,
      buyOrderId: r.buyOrderId,
      sellOrderId: r.sellOrderId,
      quantity: r.quantity,
      status: r.status,
      notes: r.notes,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      buyerName: userMap.get(r.buyerUserId) ?? 'Unknown',
      sellerName: userMap.get(r.sellerUserId) ?? 'Unknown',
      commodityTicker: r.commodityTicker,
      locationId: r.locationId,
      buyOrderPrice: parseFloat(r.buyOrderPrice),
      sellOrderPrice: parseFloat(r.sellOrderPrice),
      currency: r.currency,
      isBuyer: r.buyerUserId === userId,
      isSeller: r.sellerUserId === userId,
    }
  }

  /**
   * Create a new reservation linking a buy order to a sell order
   */
  @Post()
  @SuccessResponse(201, 'Reservation created')
  public async createReservation(
    @Body() body: CreateReservationRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    const userId = request.user.userId

    // Verify the buy order exists and belongs to the current user
    const [buyOrder] = await db.select().from(buyOrders).where(eq(buyOrders.id, body.buyOrderId))

    if (!buyOrder) {
      throw NotFound('Buy order not found')
    }

    if (buyOrder.userId !== userId) {
      throw Forbidden('You can only create reservations for your own buy orders')
    }

    // Verify the sell order exists
    const [sellOrder] = await db
      .select()
      .from(sellOrders)
      .where(eq(sellOrders.id, body.sellOrderId))

    if (!sellOrder) {
      throw NotFound('Sell order not found')
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

    // Verify orders are compatible (same commodity, location, currency)
    if (buyOrder.commodityTicker !== sellOrder.commodityTicker) {
      throw BadRequest('Buy and sell orders must be for the same commodity')
    }

    if (buyOrder.locationId !== sellOrder.locationId) {
      throw BadRequest('Buy and sell orders must be for the same location')
    }

    if (buyOrder.currency !== sellOrder.currency) {
      throw BadRequest('Buy and sell orders must use the same currency')
    }

    // Cannot reserve from your own sell order
    if (sellOrder.userId === userId) {
      throw BadRequest('You cannot create a reservation against your own sell order')
    }

    // Validate quantity
    if (body.quantity <= 0) {
      throw BadRequest('Quantity must be greater than 0')
    }

    // Create the reservation
    const [reservation] = await db
      .insert(orderReservations)
      .values({
        buyOrderId: body.buyOrderId,
        sellOrderId: body.sellOrderId,
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
      `${buyer?.displayName ?? 'Someone'} wants to reserve ${body.quantity} ${buyOrder.commodityTicker} from your sell order`,
      {
        reservationId: reservation.id,
        buyOrderId: body.buyOrderId,
        sellOrderId: body.sellOrderId,
        buyerId: userId,
        quantity: body.quantity,
        commodityTicker: buyOrder.commodityTicker,
        locationId: buyOrder.locationId,
      }
    )

    return {
      id: reservation.id,
      buyOrderId: reservation.buyOrderId,
      sellOrderId: reservation.sellOrderId,
      quantity: reservation.quantity,
      status: reservation.status,
      notes: reservation.notes,
      expiresAt: reservation.expiresAt?.toISOString() ?? null,
      createdAt: reservation.createdAt.toISOString(),
      updatedAt: reservation.updatedAt.toISOString(),
    }
  }

  /**
   * Confirm a reservation (seller only)
   */
  @Put('{id}/confirm')
  @SuccessResponse(200, 'Reservation confirmed')
  public async confirmReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'confirmed', request.user.userId, body.notes, 'seller')
  }

  /**
   * Reject a reservation (seller only)
   */
  @Put('{id}/reject')
  @SuccessResponse(200, 'Reservation rejected')
  public async rejectReservation(
    @Path() id: number,
    @Body() body: UpdateReservationStatusRequest,
    @Request() request: { user: JwtPayload }
  ): Promise<ReservationResponse> {
    return this.updateReservationStatus(id, 'rejected', request.user.userId, body.notes, 'seller')
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
   * Cancel a reservation (buyer can cancel pending, seller can cancel any)
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
   * Delete a reservation (buyer only, if pending)
   */
  @Delete('{id}')
  @SuccessResponse(204, 'Reservation deleted')
  public async deleteReservation(
    @Path() id: number,
    @Request() request: { user: JwtPayload }
  ): Promise<void> {
    const userId = request.user.userId

    // Get the reservation with order info
    const results = await db
      .select({
        id: orderReservations.id,
        status: orderReservations.status,
        buyerUserId: buyOrders.userId,
        sellerUserId: sellOrders.userId,
      })
      .from(orderReservations)
      .innerJoin(buyOrders, eq(orderReservations.buyOrderId, buyOrders.id))
      .innerJoin(sellOrders, eq(orderReservations.sellOrderId, sellOrders.id))
      .where(eq(orderReservations.id, id))

    if (results.length === 0) {
      throw NotFound('Reservation not found')
    }

    const reservation = results[0]

    // Only buyer can delete, and only if pending
    if (reservation.buyerUserId !== userId) {
      throw Forbidden('Only the buyer can delete a reservation')
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
    allowedRole: 'buyer' | 'seller' | 'either'
  ): Promise<ReservationResponse> {
    // Get the reservation with order info
    const results = await db
      .select({
        id: orderReservations.id,
        buyOrderId: orderReservations.buyOrderId,
        sellOrderId: orderReservations.sellOrderId,
        quantity: orderReservations.quantity,
        status: orderReservations.status,
        notes: orderReservations.notes,
        expiresAt: orderReservations.expiresAt,
        createdAt: orderReservations.createdAt,
        updatedAt: orderReservations.updatedAt,
        buyerUserId: buyOrders.userId,
        sellerUserId: sellOrders.userId,
        commodityTicker: buyOrders.commodityTicker,
        locationId: buyOrders.locationId,
      })
      .from(orderReservations)
      .innerJoin(buyOrders, eq(orderReservations.buyOrderId, buyOrders.id))
      .innerJoin(sellOrders, eq(orderReservations.sellOrderId, sellOrders.id))
      .where(eq(orderReservations.id, id))

    if (results.length === 0) {
      throw NotFound('Reservation not found')
    }

    const reservation = results[0]
    const isBuyer = reservation.buyerUserId === userId
    const isSeller = reservation.sellerUserId === userId

    // Check authorization
    if (allowedRole === 'buyer' && !isBuyer) {
      throw Forbidden('Only the buyer can perform this action')
    }
    if (allowedRole === 'seller' && !isSeller) {
      throw Forbidden('Only the seller can perform this action')
    }
    if (allowedRole === 'either' && !isBuyer && !isSeller) {
      throw Forbidden('You do not have access to this reservation')
    }

    // Validate status transition
    const validTransitions: Record<ReservationStatus, ReservationStatus[]> = {
      pending: ['confirmed', 'rejected', 'cancelled'],
      confirmed: ['fulfilled', 'cancelled'],
      rejected: [],
      fulfilled: [],
      expired: [],
      cancelled: [],
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
    const otherPartyId = isBuyer ? reservation.sellerUserId : reservation.buyerUserId

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
        title: 'Reservation Confirmed',
        getMessage: n =>
          `${n} confirmed your reservation for ${reservation.quantity} ${reservation.commodityTicker}`,
      },
      rejected: {
        type: 'reservation_rejected',
        title: 'Reservation Rejected',
        getMessage: n =>
          `${n} rejected your reservation for ${reservation.quantity} ${reservation.commodityTicker}`,
      },
      fulfilled: {
        type: 'reservation_fulfilled',
        title: 'Reservation Fulfilled',
        getMessage: n =>
          `${n} marked the reservation for ${reservation.quantity} ${reservation.commodityTicker} as fulfilled`,
      },
      cancelled: {
        type: 'reservation_cancelled',
        title: 'Reservation Cancelled',
        getMessage: n =>
          `${n} cancelled the reservation for ${reservation.quantity} ${reservation.commodityTicker}`,
      },
      expired: {
        type: 'reservation_expired',
        title: 'Reservation Expired',
        getMessage: () =>
          `Your reservation for ${reservation.quantity} ${reservation.commodityTicker} has expired`,
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
        buyOrderId: reservation.buyOrderId,
        sellOrderId: reservation.sellOrderId,
        quantity: reservation.quantity,
        commodityTicker: reservation.commodityTicker,
        locationId: reservation.locationId,
      }
    )

    return {
      id: updated.id,
      buyOrderId: updated.buyOrderId,
      sellOrderId: updated.sellOrderId,
      quantity: updated.quantity,
      status: updated.status,
      notes: updated.notes,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }
  }
}
