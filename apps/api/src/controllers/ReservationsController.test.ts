import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReservationsController } from './ReservationsController.js'
import { db } from '../db/index.js'
import { notificationService } from '../services/notificationService.js'
import * as permissionService from '../utils/permissionService.js'

vi.mock('../utils/permissionService.js', () => ({
  hasPermission: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  orderReservations: {
    id: 'id',
    buyOrderId: 'buyOrderId',
    sellOrderId: 'sellOrderId',
    counterpartyUserId: 'counterpartyUserId',
    quantity: 'quantity',
    status: 'status',
    notes: 'notes',
    expiresAt: 'expiresAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  buyOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    price: 'price',
    currency: 'currency',
  },
  sellOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    price: 'price',
    currency: 'currency',
  },
  users: {
    id: 'id',
    displayName: 'displayName',
  },
}))

vi.mock('../services/notificationService.js', () => ({
  notificationService: {
    create: vi.fn(),
  },
}))

describe('ReservationsController', () => {
  let controller: ReservationsController
  let mockSelect: any
  let mockInsert: any
  let mockUpdate: any
  let mockDelete: any
  const mockCounterpartyRequest = {
    user: { userId: 1, username: 'counterparty', roles: ['member'] },
  }
  const mockOrderOwnerRequest = { user: { userId: 2, username: 'owner', roles: ['member'] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new ReservationsController()

    // Default: allow all permissions
    vi.mocked(permissionService.hasPermission).mockResolvedValue(true)

    // Create mock object first, then assign methods that return it for chaining
    mockSelect = {} as any
    mockSelect.from = vi.fn().mockReturnValue(mockSelect)
    mockSelect.innerJoin = vi.fn().mockReturnValue(mockSelect)
    mockSelect.where = vi.fn().mockReturnValue(mockSelect)
    mockSelect.orderBy = vi.fn().mockReturnValue(mockSelect)
    mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
    }
    mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
    }
    mockDelete = {
      where: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(db.select).mockReturnValue(mockSelect)
    vi.mocked(db.insert).mockReturnValue(mockInsert)
    vi.mocked(db.update).mockReturnValue(mockUpdate)
    vi.mocked(db.delete).mockReturnValue(mockDelete)
  })

  const mockSellOrder = {
    id: 2,
    userId: 2, // Owner is user 2
    commodityTicker: 'H2O',
    locationId: 'BEN',
    price: '95.00',
    currency: 'CIS',
    orderType: 'internal' as const,
  }

  const mockBuyOrder = {
    id: 1,
    userId: 2, // Owner is user 2
    commodityTicker: 'H2O',
    locationId: 'BEN',
    price: '100.00',
    currency: 'CIS',
    quantity: 500,
    orderType: 'internal' as const,
  }

  const mockSellOrderReservation = {
    id: 1,
    sellOrderId: 2,
    buyOrderId: null,
    counterpartyUserId: 1, // User 1 is reserving from the sell order
    quantity: 100,
    status: 'pending' as const,
    notes: null,
    expiresAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  const mockBuyOrderReservation = {
    id: 2,
    sellOrderId: null,
    buyOrderId: 1,
    counterpartyUserId: 1, // User 1 is filling the buy order
    quantity: 100,
    status: 'pending' as const,
    notes: null,
    expiresAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  describe('createSellOrderReservation', () => {
    it('should create a reservation against a sell order and notify the seller', async () => {
      // Get sell order
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      // Insert returns new reservation
      mockInsert.returning.mockResolvedValueOnce([mockSellOrderReservation])
      // Get counterparty name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'CounterpartyUser' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.createSellOrderReservation(
        {
          sellOrderId: 2,
          quantity: 100,
        },
        mockCounterpartyRequest
      )

      expect(result.id).toBe(1)
      expect(result.status).toBe('pending')
      expect(result.quantity).toBe(100)
      expect(result.sellOrderId).toBe(2)
      expect(result.buyOrderId).toBeNull()
      expect(notificationService.create).toHaveBeenCalledWith(
        2, // seller/order owner user ID
        'reservation_placed',
        'New Reservation',
        expect.stringContaining('CounterpartyUser'),
        expect.objectContaining({
          reservationId: 1,
          sellOrderId: 2,
          counterpartyUserId: 1,
        })
      )
    })

    it('should throw NotFound if sell order does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(
        controller.createSellOrderReservation(
          { sellOrderId: 999, quantity: 100 },
          mockCounterpartyRequest
        )
      ).rejects.toThrow('Sell order not found')
    })

    it('should throw BadRequest if trying to reserve from own sell order', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockSellOrder, userId: 1 }]) // User 1 owns the order

      await expect(
        controller.createSellOrderReservation(
          { sellOrderId: 2, quantity: 100 },
          mockCounterpartyRequest
        )
      ).rejects.toThrow('You cannot create a reservation against your own sell order')
    })

    it('should throw BadRequest if quantity is zero or negative', async () => {
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])

      await expect(
        controller.createSellOrderReservation(
          { sellOrderId: 2, quantity: 0 },
          mockCounterpartyRequest
        )
      ).rejects.toThrow('Quantity must be greater than 0')
    })

    it('should throw Forbidden if user lacks permission for internal orders', async () => {
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      vi.mocked(permissionService.hasPermission).mockResolvedValueOnce(false)

      await expect(
        controller.createSellOrderReservation(
          { sellOrderId: 2, quantity: 100 },
          mockCounterpartyRequest
        )
      ).rejects.toThrow('You do not have permission to place reservations on internal orders')
    })

    it('should throw Forbidden if user lacks permission for partner orders', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockSellOrder, orderType: 'partner' }])
      vi.mocked(permissionService.hasPermission).mockResolvedValueOnce(false)

      await expect(
        controller.createSellOrderReservation(
          { sellOrderId: 2, quantity: 100 },
          mockCounterpartyRequest
        )
      ).rejects.toThrow('You do not have permission to place reservations on partner orders')
    })
  })

  describe('createBuyOrderReservation', () => {
    it('should create a reservation against a buy order and notify the buyer', async () => {
      // Get buy order
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      // Insert returns new reservation
      mockInsert.returning.mockResolvedValueOnce([mockBuyOrderReservation])
      // Get counterparty name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'CounterpartyUser' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.createBuyOrderReservation(
        {
          buyOrderId: 1,
          quantity: 100,
        },
        mockCounterpartyRequest
      )

      expect(result.id).toBe(2)
      expect(result.status).toBe('pending')
      expect(result.quantity).toBe(100)
      expect(result.buyOrderId).toBe(1)
      expect(result.sellOrderId).toBeNull()
      expect(notificationService.create).toHaveBeenCalledWith(
        2, // buyer/order owner user ID
        'reservation_placed',
        'Order Fill Request',
        expect.stringContaining('CounterpartyUser'),
        expect.objectContaining({
          reservationId: 2,
          buyOrderId: 1,
          counterpartyUserId: 1,
        })
      )
    })

    it('should throw NotFound if buy order does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(
        controller.createBuyOrderReservation(
          { buyOrderId: 999, quantity: 100 },
          mockCounterpartyRequest
        )
      ).rejects.toThrow('Buy order not found')
    })

    it('should throw BadRequest if trying to fill own buy order', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockBuyOrder, userId: 1 }]) // User 1 owns the order

      await expect(
        controller.createBuyOrderReservation(
          { buyOrderId: 1, quantity: 100 },
          mockCounterpartyRequest
        )
      ).rejects.toThrow('You cannot create a reservation against your own buy order')
    })
  })

  describe('getReservations', () => {
    it('should return reservations for the user', async () => {
      const mockSellOrderResults = [
        {
          id: 1,
          sellOrderId: 2,
          buyOrderId: null,
          counterpartyUserId: 1,
          quantity: 100,
          status: 'pending',
          notes: null,
          expiresAt: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          orderOwnerUserId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '95.00',
          currency: 'CIS',
        },
      ]

      // First query for sell order reservations
      mockSelect.where.mockResolvedValueOnce(mockSellOrderResults)
      // Second query for buy order reservations
      mockSelect.where.mockResolvedValueOnce([])
      // Third query for user names
      mockSelect.where.mockResolvedValueOnce([
        { id: 1, displayName: 'Counterparty' },
        { id: 2, displayName: 'Owner' },
      ])

      const result = await controller.getReservations(mockCounterpartyRequest)

      expect(result).toHaveLength(1)
      expect(result[0].orderOwnerName).toBe('Owner')
      expect(result[0].counterpartyName).toBe('Counterparty')
      expect(result[0].isOrderOwner).toBe(false)
      expect(result[0].isCounterparty).toBe(true)
    })
  })

  describe('confirmReservation', () => {
    it('should allow order owner to confirm a pending reservation', async () => {
      // updateReservationStatus flow:
      // 1. Get the reservation by ID
      mockSelect.where.mockResolvedValueOnce([mockSellOrderReservation])
      // 2. Get the sell order for owner info (since sellOrderId is set)
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      // 3. Update the reservation
      mockUpdate.returning.mockResolvedValueOnce([
        { ...mockSellOrderReservation, status: 'confirmed', updatedAt: new Date() },
      ])
      // 4. Get actor name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Owner' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.confirmReservation(1, {}, mockOrderOwnerRequest)

      expect(result.status).toBe('confirmed')
      expect(notificationService.create).toHaveBeenCalledWith(
        1, // counterparty
        'reservation_confirmed',
        'Confirmed',
        expect.any(String),
        expect.any(Object)
      )
    })

    it('should throw Forbidden if counterparty tries to confirm', async () => {
      // Get reservation
      mockSelect.where.mockResolvedValueOnce([mockSellOrderReservation])
      // Get sell order for owner info
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])

      await expect(controller.confirmReservation(1, {}, mockCounterpartyRequest)).rejects.toThrow(
        'Only the order owner can perform this action'
      )
    })
  })

  describe('rejectReservation', () => {
    it('should allow order owner to reject a pending reservation', async () => {
      // Get reservation
      mockSelect.where.mockResolvedValueOnce([mockSellOrderReservation])
      // Get sell order for owner info
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      // Update returns
      mockUpdate.returning.mockResolvedValueOnce([
        { ...mockSellOrderReservation, status: 'rejected', updatedAt: new Date() },
      ])
      // Get actor name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Owner' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.rejectReservation(1, {}, mockOrderOwnerRequest)

      expect(result.status).toBe('rejected')
      expect(notificationService.create).toHaveBeenCalledWith(
        1, // counterparty
        'reservation_rejected',
        'Rejected',
        expect.any(String),
        expect.any(Object)
      )
    })
  })

  describe('fulfillReservation', () => {
    it('should allow either party to fulfill a confirmed reservation', async () => {
      const confirmedReservation = {
        ...mockSellOrderReservation,
        status: 'confirmed' as const,
      }

      // Get reservation
      mockSelect.where.mockResolvedValueOnce([confirmedReservation])
      // Get sell order for owner info
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      // Update returns
      mockUpdate.returning.mockResolvedValueOnce([
        { ...confirmedReservation, status: 'fulfilled', updatedAt: new Date() },
      ])
      // Get actor name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Counterparty' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.fulfillReservation(1, {}, mockCounterpartyRequest)

      expect(result.status).toBe('fulfilled')
    })

    it('should allow fulfilling a pending reservation', async () => {
      // Get reservation (pending status)
      mockSelect.where.mockResolvedValueOnce([mockSellOrderReservation])
      // Get sell order for owner info
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      // Update returns
      mockUpdate.returning.mockResolvedValueOnce([
        { ...mockSellOrderReservation, status: 'fulfilled', updatedAt: new Date() },
      ])
      // Get actor name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Counterparty' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.fulfillReservation(1, {}, mockCounterpartyRequest)

      expect(result.status).toBe('fulfilled')
    })
  })

  describe('cancelReservation', () => {
    it('should allow counterparty to cancel a pending reservation', async () => {
      // Get reservation
      mockSelect.where.mockResolvedValueOnce([mockSellOrderReservation])
      // Get sell order for owner info
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      // Update returns
      mockUpdate.returning.mockResolvedValueOnce([
        { ...mockSellOrderReservation, status: 'cancelled', updatedAt: new Date() },
      ])
      // Get actor name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Counterparty' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.cancelReservation(1, {}, mockCounterpartyRequest)

      expect(result.status).toBe('cancelled')
    })
  })

  describe('deleteReservation', () => {
    it('should allow counterparty to delete a pending reservation', async () => {
      mockSelect.where.mockResolvedValueOnce([mockSellOrderReservation])
      mockDelete.where.mockResolvedValueOnce(undefined)

      await controller.deleteReservation(1, mockCounterpartyRequest)

      expect(db.delete).toHaveBeenCalled()
    })

    it('should throw Forbidden if order owner tries to delete', async () => {
      mockSelect.where.mockResolvedValueOnce([mockSellOrderReservation])

      await expect(controller.deleteReservation(1, mockOrderOwnerRequest)).rejects.toThrow(
        'Only the person who created the reservation can delete it'
      )
    })

    it('should throw BadRequest if reservation is not pending', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockSellOrderReservation, status: 'confirmed' }])

      await expect(controller.deleteReservation(1, mockCounterpartyRequest)).rejects.toThrow(
        'Only pending reservations can be deleted'
      )
    })
  })
})
