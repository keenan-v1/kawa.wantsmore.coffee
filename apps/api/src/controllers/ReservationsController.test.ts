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
  const mockRequest = { user: { userId: 1, username: 'buyer', roles: ['member'] } }
  const mockSellerRequest = { user: { userId: 2, username: 'seller', roles: ['member'] } }

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

  const mockBuyOrder = {
    id: 1,
    userId: 1,
    commodityTicker: 'H2O',
    locationId: 'BEN',
    price: '100.00',
    currency: 'CIS',
    quantity: 500,
  }

  const mockSellOrder = {
    id: 2,
    userId: 2,
    commodityTicker: 'H2O',
    locationId: 'BEN',
    price: '95.00',
    currency: 'CIS',
    orderType: 'internal' as const,
  }

  const mockReservation = {
    id: 1,
    buyOrderId: 1,
    sellOrderId: 2,
    quantity: 100,
    status: 'pending' as const,
    notes: null,
    expiresAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  describe('createReservation', () => {
    it('should create a reservation and notify the seller', async () => {
      // First call: get buy order
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      // Second call: get sell order
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      // Insert returns new reservation
      mockInsert.returning.mockResolvedValueOnce([mockReservation])
      // Get buyer name for notification
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'BuyerUser' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.createReservation(
        {
          buyOrderId: 1,
          sellOrderId: 2,
          quantity: 100,
        },
        mockRequest
      )

      expect(result.id).toBe(1)
      expect(result.status).toBe('pending')
      expect(result.quantity).toBe(100)
      expect(notificationService.create).toHaveBeenCalledWith(
        2, // seller user ID
        'reservation_placed',
        'New Reservation',
        expect.stringContaining('BuyerUser'),
        expect.objectContaining({
          reservationId: 1,
          buyOrderId: 1,
          sellOrderId: 2,
        })
      )
    })

    it('should throw NotFound if buy order does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(
        controller.createReservation(
          { buyOrderId: 999, sellOrderId: 2, quantity: 100 },
          mockRequest
        )
      ).rejects.toThrow('Buy order not found')
    })

    it('should throw Forbidden if buy order belongs to different user', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockBuyOrder, userId: 99 }])

      await expect(
        controller.createReservation({ buyOrderId: 1, sellOrderId: 2, quantity: 100 }, mockRequest)
      ).rejects.toThrow('You can only create reservations for your own buy orders')
    })

    it('should throw NotFound if sell order does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      mockSelect.where.mockResolvedValueOnce([])

      await expect(
        controller.createReservation(
          { buyOrderId: 1, sellOrderId: 999, quantity: 100 },
          mockRequest
        )
      ).rejects.toThrow('Sell order not found')
    })

    it('should throw BadRequest if commodity does not match', async () => {
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      mockSelect.where.mockResolvedValueOnce([{ ...mockSellOrder, commodityTicker: 'RAT' }])

      await expect(
        controller.createReservation({ buyOrderId: 1, sellOrderId: 2, quantity: 100 }, mockRequest)
      ).rejects.toThrow('Buy and sell orders must be for the same commodity')
    })

    it('should throw BadRequest if location does not match', async () => {
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      mockSelect.where.mockResolvedValueOnce([{ ...mockSellOrder, locationId: 'IC1' }])

      await expect(
        controller.createReservation({ buyOrderId: 1, sellOrderId: 2, quantity: 100 }, mockRequest)
      ).rejects.toThrow('Buy and sell orders must be for the same location')
    })

    it('should throw BadRequest if trying to reserve from own sell order', async () => {
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      mockSelect.where.mockResolvedValueOnce([{ ...mockSellOrder, userId: 1 }])

      await expect(
        controller.createReservation({ buyOrderId: 1, sellOrderId: 2, quantity: 100 }, mockRequest)
      ).rejects.toThrow('You cannot create a reservation against your own sell order')
    })

    it('should throw BadRequest if quantity is zero or negative', async () => {
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])

      await expect(
        controller.createReservation({ buyOrderId: 1, sellOrderId: 2, quantity: 0 }, mockRequest)
      ).rejects.toThrow('Quantity must be greater than 0')
    })

    it('should throw Forbidden if user lacks permission for internal orders', async () => {
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      vi.mocked(permissionService.hasPermission).mockResolvedValueOnce(false)

      await expect(
        controller.createReservation({ buyOrderId: 1, sellOrderId: 2, quantity: 100 }, mockRequest)
      ).rejects.toThrow('You do not have permission to place reservations on internal orders')
    })

    it('should throw Forbidden if user lacks permission for partner orders', async () => {
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      mockSelect.where.mockResolvedValueOnce([{ ...mockSellOrder, orderType: 'partner' }])
      vi.mocked(permissionService.hasPermission).mockResolvedValueOnce(false)

      await expect(
        controller.createReservation({ buyOrderId: 1, sellOrderId: 2, quantity: 100 }, mockRequest)
      ).rejects.toThrow('You do not have permission to place reservations on partner orders')
    })

    it('should check for reservations.place_internal permission for internal orders', async () => {
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      mockSelect.where.mockResolvedValueOnce([mockSellOrder])
      mockInsert.returning.mockResolvedValueOnce([mockReservation])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'BuyerUser' }])
      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      await controller.createReservation(
        { buyOrderId: 1, sellOrderId: 2, quantity: 100 },
        mockRequest
      )

      expect(permissionService.hasPermission).toHaveBeenCalledWith(
        ['member'],
        'reservations.place_internal'
      )
    })

    it('should check for reservations.place_partner permission for partner orders', async () => {
      mockSelect.where.mockResolvedValueOnce([mockBuyOrder])
      mockSelect.where.mockResolvedValueOnce([{ ...mockSellOrder, orderType: 'partner' }])
      mockInsert.returning.mockResolvedValueOnce([mockReservation])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'BuyerUser' }])
      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      await controller.createReservation(
        { buyOrderId: 1, sellOrderId: 2, quantity: 100 },
        mockRequest
      )

      expect(permissionService.hasPermission).toHaveBeenCalledWith(
        ['member'],
        'reservations.place_partner'
      )
    })
  })

  describe('getReservations', () => {
    it('should return reservations for the user', async () => {
      const mockResults = [
        {
          id: 1,
          buyOrderId: 1,
          sellOrderId: 2,
          quantity: 100,
          status: 'pending',
          notes: null,
          expiresAt: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          buyerUserId: 1,
          sellerUserId: 2,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          buyOrderPrice: '100.00',
          sellOrderPrice: '95.00',
          currency: 'CIS',
        },
      ]

      // First query chain: select().from().innerJoin().innerJoin().where().orderBy()
      // Second query chain: select().from().where() (for user names)
      // Use call counting to return mockSelect for chaining on first where() call
      let whereCallCount = 0
      mockSelect.where.mockImplementation(() => {
        whereCallCount++
        if (whereCallCount === 1) {
          // First where() is part of reservation query - needs to chain to orderBy
          return mockSelect
        }
        // Second where() is terminal for user query
        return Promise.resolve([
          { id: 1, displayName: 'Buyer' },
          { id: 2, displayName: 'Seller' },
        ])
      })

      mockSelect.orderBy.mockResolvedValueOnce(mockResults)

      const result = await controller.getReservations(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].buyerName).toBe('Buyer')
      expect(result[0].sellerName).toBe('Seller')
      expect(result[0].isBuyer).toBe(true)
      expect(result[0].isSeller).toBe(false)
    })
  })

  describe('confirmReservation', () => {
    it('should allow seller to confirm a pending reservation', async () => {
      const pendingReservation = {
        ...mockReservation,
        buyerUserId: 1,
        sellerUserId: 2,
        commodityTicker: 'H2O',
        locationId: 'BEN',
      }

      mockSelect.where.mockResolvedValueOnce([pendingReservation])
      mockUpdate.returning.mockResolvedValueOnce([
        { ...mockReservation, status: 'confirmed', updatedAt: new Date() },
      ])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Seller' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.confirmReservation(1, {}, mockSellerRequest)

      expect(result.status).toBe('confirmed')
      expect(notificationService.create).toHaveBeenCalledWith(
        1, // buyer
        'reservation_confirmed',
        'Reservation Confirmed',
        expect.any(String),
        expect.any(Object)
      )
    })

    it('should throw Forbidden if buyer tries to confirm', async () => {
      const pendingReservation = {
        ...mockReservation,
        buyerUserId: 1,
        sellerUserId: 2,
        commodityTicker: 'H2O',
        locationId: 'BEN',
      }

      mockSelect.where.mockResolvedValueOnce([pendingReservation])

      await expect(controller.confirmReservation(1, {}, mockRequest)).rejects.toThrow(
        'Only the seller can perform this action'
      )
    })
  })

  describe('rejectReservation', () => {
    it('should allow seller to reject a pending reservation', async () => {
      const pendingReservation = {
        ...mockReservation,
        buyerUserId: 1,
        sellerUserId: 2,
        commodityTicker: 'H2O',
        locationId: 'BEN',
      }

      mockSelect.where.mockResolvedValueOnce([pendingReservation])
      mockUpdate.returning.mockResolvedValueOnce([
        { ...mockReservation, status: 'rejected', updatedAt: new Date() },
      ])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Seller' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.rejectReservation(1, {}, mockSellerRequest)

      expect(result.status).toBe('rejected')
      expect(notificationService.create).toHaveBeenCalledWith(
        1,
        'reservation_rejected',
        'Reservation Rejected',
        expect.any(String),
        expect.any(Object)
      )
    })
  })

  describe('fulfillReservation', () => {
    it('should allow either party to fulfill a confirmed reservation', async () => {
      const confirmedReservation = {
        ...mockReservation,
        status: 'confirmed',
        buyerUserId: 1,
        sellerUserId: 2,
        commodityTicker: 'H2O',
        locationId: 'BEN',
      }

      mockSelect.where.mockResolvedValueOnce([confirmedReservation])
      mockUpdate.returning.mockResolvedValueOnce([
        { ...mockReservation, status: 'fulfilled', updatedAt: new Date() },
      ])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Buyer' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.fulfillReservation(1, {}, mockRequest)

      expect(result.status).toBe('fulfilled')
    })

    it('should throw BadRequest if trying to fulfill a pending reservation', async () => {
      const pendingReservation = {
        ...mockReservation,
        status: 'pending',
        buyerUserId: 1,
        sellerUserId: 2,
        commodityTicker: 'H2O',
        locationId: 'BEN',
      }

      mockSelect.where.mockResolvedValueOnce([pendingReservation])

      await expect(controller.fulfillReservation(1, {}, mockRequest)).rejects.toThrow(
        "Cannot transition from 'pending' to 'fulfilled'"
      )
    })
  })

  describe('cancelReservation', () => {
    it('should allow buyer to cancel a pending reservation', async () => {
      const pendingReservation = {
        ...mockReservation,
        buyerUserId: 1,
        sellerUserId: 2,
        commodityTicker: 'H2O',
        locationId: 'BEN',
      }

      mockSelect.where.mockResolvedValueOnce([pendingReservation])
      mockUpdate.returning.mockResolvedValueOnce([
        { ...mockReservation, status: 'cancelled', updatedAt: new Date() },
      ])
      mockSelect.where.mockResolvedValueOnce([{ displayName: 'Buyer' }])

      vi.mocked(notificationService.create).mockResolvedValue({} as any)

      const result = await controller.cancelReservation(1, {}, mockRequest)

      expect(result.status).toBe('cancelled')
    })
  })

  describe('deleteReservation', () => {
    it('should allow buyer to delete a pending reservation', async () => {
      mockSelect.where.mockResolvedValueOnce([
        { id: 1, status: 'pending', buyerUserId: 1, sellerUserId: 2 },
      ])
      mockDelete.where.mockResolvedValueOnce(undefined)

      await controller.deleteReservation(1, mockRequest)

      expect(db.delete).toHaveBeenCalled()
    })

    it('should throw Forbidden if seller tries to delete', async () => {
      mockSelect.where.mockResolvedValueOnce([
        { id: 1, status: 'pending', buyerUserId: 1, sellerUserId: 2 },
      ])

      await expect(controller.deleteReservation(1, mockSellerRequest)).rejects.toThrow(
        'Only the buyer can delete a reservation'
      )
    })

    it('should throw BadRequest if reservation is not pending', async () => {
      mockSelect.where.mockResolvedValueOnce([
        { id: 1, status: 'confirmed', buyerUserId: 1, sellerUserId: 2 },
      ])

      await expect(controller.deleteReservation(1, mockRequest)).rejects.toThrow(
        'Only pending reservations can be deleted'
      )
    })
  })
})
