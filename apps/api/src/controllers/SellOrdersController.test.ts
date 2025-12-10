import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SellOrdersController } from './SellOrdersController.js'
import { db } from '../db/index.js'
import * as permissionService from '../utils/permissionService.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  sellOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    price: 'price',
    currency: 'currency',
    orderType: 'orderType',
    limitMode: 'limitMode',
    limitQuantity: 'limitQuantity',
    updatedAt: 'updatedAt',
  },
  fioInventory: {
    userId: 'userId',
    userStorageId: 'userStorageId',
    commodityTicker: 'commodityTicker',
    quantity: 'quantity',
  },
  fioUserStorage: {
    id: 'id',
    userId: 'userId',
    locationId: 'locationId',
  },
  fioCommodities: {
    ticker: 'ticker',
  },
  fioLocations: {
    naturalId: 'naturalId',
  },
  orderReservations: {
    sellOrderId: 'sellOrderId',
    buyOrderId: 'buyOrderId',
    quantity: 'quantity',
    status: 'status',
  },
}))

vi.mock('../utils/permissionService.js', () => ({
  hasPermission: vi.fn(),
}))

describe('SellOrdersController', () => {
  let controller: SellOrdersController
  let mockSelect: any
  let mockInsert: any
  let mockUpdate: any
  let mockDelete: any
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: ['member'] } }

  // Helper to create a chainable mock for where() that supports .groupBy()
  const createWhereChainWithGroupBy = (groupByResult: any[]) => {
    const chain: any = {
      groupBy: vi.fn().mockResolvedValue(groupByResult),
    }
    // Make the chain thenable in case it's awaited without groupBy
    chain.then = (resolve: any) => Promise.resolve([]).then(resolve)
    chain.catch = (reject: any) => Promise.resolve([]).catch(reject)
    return chain
  }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SellOrdersController()

    mockSelect = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    }
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

    // Default permission mock - allow internal operations
    vi.mocked(permissionService.hasPermission).mockResolvedValue(true)
  })

  describe('getSellOrders', () => {
    it('should return sell orders with calculated availability', async () => {
      // First query returns orders
      const mockOrders = [
        {
          id: 1,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
          priceListCode: null,
        },
        {
          id: 2,
          commodityTicker: 'RAT',
          locationId: 'BEN',
          price: '50.00',
          currency: 'CIS',
          orderType: 'internal',
          limitMode: 'max_sell',
          limitQuantity: 200,
          priceListCode: null,
        },
      ]
      // Second query returns inventory with location from storage (now includes lastSyncedAt and fioUploadedAt)
      const fioUploadDate = new Date('2024-01-15T10:00:00Z')
      const mockInventory = [
        {
          commodityTicker: 'H2O',
          quantity: 1000,
          locationId: 'BEN',
          lastSyncedAt: new Date(),
          fioUploadedAt: fioUploadDate,
        },
        {
          commodityTicker: 'RAT',
          quantity: 500,
          locationId: 'BEN',
          lastSyncedAt: new Date(),
          fioUploadedAt: fioUploadDate,
        },
      ]

      // Query sequence:
      // 1. Orders query
      // 2. Inventory query
      // 3. Reservation stats query (uses .groupBy())
      // 4. Fulfilled reservations query
      mockSelect.where
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockInventory)
        .mockReturnValueOnce(createWhereChainWithGroupBy([])) // reservation stats with groupBy
        .mockResolvedValueOnce([]) // fulfilled reservations

      const result = await controller.getSellOrders(mockRequest)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: 100,
        currency: 'CIS',
        priceListCode: null,
        orderType: 'internal',
        limitMode: 'none',
        limitQuantity: null,
        fioQuantity: 1000,
        availableQuantity: 1000, // none mode: full quantity
        activeReservationCount: 0,
        reservedQuantity: 0,
        fulfilledQuantity: 0,
        remainingQuantity: 1000,
        fioUploadedAt: '2024-01-15T10:00:00.000Z',
        pricingMode: 'fixed',
        effectivePrice: null,
        isFallback: false,
        priceLocationId: null,
      })
      expect(result[1]).toEqual({
        id: 2,
        commodityTicker: 'RAT',
        locationId: 'BEN',
        price: 50,
        currency: 'CIS',
        priceListCode: null,
        orderType: 'internal',
        limitMode: 'max_sell',
        limitQuantity: 200,
        fioQuantity: 500,
        availableQuantity: 200, // max_sell mode: min(500, 200)
        activeReservationCount: 0,
        reservedQuantity: 0,
        fulfilledQuantity: 0,
        remainingQuantity: 200,
        fioUploadedAt: '2024-01-15T10:00:00.000Z',
        pricingMode: 'fixed',
        effectivePrice: null,
        isFallback: false,
        priceLocationId: null,
      })
    })

    it('should calculate reserve mode correctly', async () => {
      const mockOrders = [
        {
          id: 1,
          commodityTicker: 'CAF',
          locationId: 'BEN',
          price: '75.00',
          currency: 'CIS',
          orderType: 'internal',
          limitMode: 'reserve',
          limitQuantity: 500,
        },
      ]
      const mockInventory = [
        { commodityTicker: 'CAF', quantity: 2000, locationId: 'BEN', lastSyncedAt: new Date() },
      ]

      mockSelect.where
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockInventory)
        .mockReturnValueOnce(createWhereChainWithGroupBy([])) // reservation stats
        .mockResolvedValueOnce([]) // fulfilled reservations

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].availableQuantity).toBe(1500) // reserve mode: max(0, 2000 - 500)
    })

    it('should handle null FIO inventory', async () => {
      const mockOrders = [
        {
          id: 1,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          orderType: 'internal',
          limitMode: 'none',
          limitQuantity: null,
        },
      ]
      // No inventory for this location/commodity
      const mockInventory: any[] = []

      mockSelect.where
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockInventory)
        .mockReturnValueOnce(createWhereChainWithGroupBy([])) // reservation stats
        .mockResolvedValueOnce([]) // fulfilled reservations

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].fioQuantity).toBe(0)
      expect(result[0].availableQuantity).toBe(0)
    })

    it('should return empty array when no orders exist', async () => {
      mockSelect.where.mockResolvedValueOnce([]) // No orders
      mockSelect.where.mockResolvedValueOnce([]) // No inventory (still queried)

      const result = await controller.getSellOrders(mockRequest)

      expect(result).toEqual([])
    })

    it('should return orders with partner orderType', async () => {
      const mockOrders = [
        {
          id: 1,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          orderType: 'partner',
          limitMode: 'none',
          limitQuantity: null,
        },
      ]
      const mockInventory = [
        { commodityTicker: 'H2O', quantity: 1000, locationId: 'BEN', lastSyncedAt: new Date() },
      ]

      mockSelect.where
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockInventory)
        .mockReturnValueOnce(createWhereChainWithGroupBy([])) // reservation stats
        .mockResolvedValueOnce([]) // fulfilled reservations

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].orderType).toBe('partner')
      expect(result[0].fioQuantity).toBe(1000)
    })
  })

  describe('getSellOrder', () => {
    it('should return a specific sell order', async () => {
      const mockOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        orderType: 'internal',
        limitMode: 'none',
        limitQuantity: null,
      }
      // First query: get order
      mockSelect.where.mockResolvedValueOnce([mockOrder])
      // Second query: getInventoryWithSyncTime
      mockSelect.where.mockResolvedValueOnce([{ quantity: 1000, lastSyncedAt: new Date() }])
      // Third query: getReservationCounts - active stats
      mockSelect.where.mockResolvedValueOnce([{ count: 0, quantity: 0 }])
      // Fourth query: getReservationCounts - fulfilled reservations (for FIO-backed 'none' mode)
      mockSelect.where.mockResolvedValueOnce([])

      const result = await controller.getSellOrder(1, mockRequest)

      expect(result.id).toBe(1)
      expect(result.commodityTicker).toBe('H2O')
      expect(result.fioQuantity).toBe(1000)
      expect(result.availableQuantity).toBe(1000)
      expect(result.orderType).toBe('internal')
    })

    it('should throw 404 when order not found', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.getSellOrder(999, mockRequest)).rejects.toThrow(
        'Sell order not found'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('createSellOrder', () => {
    it('should create a new internal sell order', async () => {
      // Mock commodity validation
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'H2O' }]) // commodity exists
        .mockResolvedValueOnce([{ id: 'BEN' }]) // location exists
        .mockResolvedValueOnce([]) // no duplicate
        .mockResolvedValueOnce([]) // no FIO inventory

      const newOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        orderType: 'internal',
        limitMode: 'none',
        limitQuantity: null,
      }

      mockInsert.returning.mockResolvedValueOnce([newOrder])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const result = await controller.createSellOrder(
        {
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: 100,
          currency: 'CIS',
        },
        mockRequest
      )

      expect(result.id).toBe(1)
      expect(result.commodityTicker).toBe('H2O')
      expect(result.price).toBe(100)
      expect(result.orderType).toBe('internal')
      expect(setStatusSpy).toHaveBeenCalledWith(201)
      expect(permissionService.hasPermission).toHaveBeenCalledWith(
        ['member'],
        'orders.post_internal'
      )
    })

    it('should create partner order when user has permission', async () => {
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'H2O' }]) // commodity exists
        .mockResolvedValueOnce([{ id: 'BEN' }]) // location exists
        .mockResolvedValueOnce([]) // no duplicate
        .mockResolvedValueOnce([]) // no FIO inventory

      const newOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        orderType: 'partner',
        limitMode: 'none',
        limitQuantity: null,
      }

      mockInsert.returning.mockResolvedValueOnce([newOrder])

      const result = await controller.createSellOrder(
        {
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: 100,
          currency: 'CIS',
          orderType: 'partner',
        },
        mockRequest
      )

      expect(result.orderType).toBe('partner')
      expect(permissionService.hasPermission).toHaveBeenCalledWith(
        ['member'],
        'orders.post_partner'
      )
    })

    it('should throw 403 when user lacks permission to post internal orders', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValueOnce(false)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.createSellOrder(
          {
            commodityTicker: 'H2O',
            locationId: 'BEN',
            price: 100,
            currency: 'CIS',
          },
          mockRequest
        )
      ).rejects.toThrow('You do not have permission to create internal orders')
      expect(setStatusSpy).toHaveBeenCalledWith(403)
    })

    it('should throw 403 when user lacks permission to post partner orders', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValueOnce(false)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.createSellOrder(
          {
            commodityTicker: 'H2O',
            locationId: 'BEN',
            price: 100,
            currency: 'CIS',
            orderType: 'partner',
          },
          mockRequest
        )
      ).rejects.toThrow('You do not have permission to create partner orders')
      expect(setStatusSpy).toHaveBeenCalledWith(403)
    })

    it('should throw 400 when commodity does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([]) // commodity not found

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.createSellOrder(
          {
            commodityTicker: 'INVALID',
            locationId: 'BEN',
            price: 100,
            currency: 'CIS',
          },
          mockRequest
        )
      ).rejects.toThrow('Commodity INVALID not found')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should throw 400 when location does not exist', async () => {
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'H2O' }]) // commodity exists
        .mockResolvedValueOnce([]) // location not found

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.createSellOrder(
          {
            commodityTicker: 'H2O',
            locationId: 'INVALID',
            price: 100,
            currency: 'CIS',
          },
          mockRequest
        )
      ).rejects.toThrow('Location INVALID not found')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should throw 400 when duplicate internal order exists', async () => {
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'H2O' }]) // commodity exists
        .mockResolvedValueOnce([{ id: 'BEN' }]) // location exists
        .mockResolvedValueOnce([{ id: 1 }]) // duplicate exists

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.createSellOrder(
          {
            commodityTicker: 'H2O',
            locationId: 'BEN',
            price: 100,
            currency: 'CIS',
          },
          mockRequest
        )
      ).rejects.toThrow('Sell order already exists for H2O at BEN (internal, CIS)')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should throw 400 when duplicate partner order exists', async () => {
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'H2O' }]) // commodity exists
        .mockResolvedValueOnce([{ id: 'BEN' }]) // location exists
        .mockResolvedValueOnce([{ id: 1 }]) // duplicate exists

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.createSellOrder(
          {
            commodityTicker: 'H2O',
            locationId: 'BEN',
            price: 100,
            currency: 'CIS',
            orderType: 'partner',
          },
          mockRequest
        )
      ).rejects.toThrow('Sell order already exists for H2O at BEN (partner, CIS)')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should allow creating order with same commodity/location but different orderType', async () => {
      // User has an internal order, but should be able to create partner order
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'H2O' }]) // commodity exists
        .mockResolvedValueOnce([{ id: 'BEN' }]) // location exists
        .mockResolvedValueOnce([]) // no duplicate (different orderType)
        .mockResolvedValueOnce([{ quantity: 1000 }]) // FIO inventory

      const newOrder = {
        id: 2,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        orderType: 'partner',
        limitMode: 'none',
        limitQuantity: null,
      }

      mockInsert.returning.mockResolvedValueOnce([newOrder])

      const result = await controller.createSellOrder(
        {
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: 100,
          currency: 'CIS',
          orderType: 'partner',
        },
        mockRequest
      )

      expect(result.id).toBe(2)
      expect(result.orderType).toBe('partner')
    })

    it('should allow creating order with same commodity/location/orderType but different currency', async () => {
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'H2O' }]) // commodity exists
        .mockResolvedValueOnce([{ id: 'BEN' }]) // location exists
        .mockResolvedValueOnce([]) // no duplicate (different currency)
        .mockResolvedValueOnce([{ quantity: 1000 }]) // FIO inventory

      const newOrder = {
        id: 2,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'ICA',
        orderType: 'internal',
        limitMode: 'none',
        limitQuantity: null,
      }

      mockInsert.returning.mockResolvedValueOnce([newOrder])

      const result = await controller.createSellOrder(
        {
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: 100,
          currency: 'ICA',
        },
        mockRequest
      )

      expect(result.id).toBe(2)
      expect(result.currency).toBe('ICA')
    })

    it('should create order with limit settings', async () => {
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'CAF' }])
        .mockResolvedValueOnce([{ id: 'BEN' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ quantity: 2000 }]) // FIO inventory

      const newOrder = {
        id: 1,
        commodityTicker: 'CAF',
        locationId: 'BEN',
        price: '75.00',
        currency: 'CIS',
        orderType: 'internal',
        limitMode: 'reserve',
        limitQuantity: 500,
      }

      mockInsert.returning.mockResolvedValueOnce([newOrder])

      const result = await controller.createSellOrder(
        {
          commodityTicker: 'CAF',
          locationId: 'BEN',
          price: 75,
          currency: 'CIS',
          limitMode: 'reserve',
          limitQuantity: 500,
        },
        mockRequest
      )

      expect(result.limitMode).toBe('reserve')
      expect(result.limitQuantity).toBe(500)
      expect(result.fioQuantity).toBe(2000)
      expect(result.availableQuantity).toBe(1500) // 2000 - 500
    })
  })

  describe('updateSellOrder', () => {
    it('should update sell order price', async () => {
      mockSelect.where.mockResolvedValueOnce([{ id: 1, userId: 1, orderType: 'internal' }]) // existing order

      const updatedOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '150.00',
        currency: 'CIS',
        orderType: 'internal',
        limitMode: 'none',
        limitQuantity: null,
      }

      mockUpdate.returning.mockResolvedValueOnce([updatedOrder])
      mockSelect.where.mockResolvedValueOnce([]) // no FIO inventory (with sync time)
      mockSelect.where.mockResolvedValueOnce([{ count: 0, quantity: 0 }]) // reservation stats
      mockSelect.where.mockResolvedValueOnce([]) // fulfilled reservations

      const result = await controller.updateSellOrder(1, { price: 150 }, mockRequest)

      expect(result.price).toBe(150)
      expect(db.update).toHaveBeenCalled()
    })

    it('should update orderType when user has permission', async () => {
      mockSelect.where.mockResolvedValueOnce([{ id: 1, userId: 1, orderType: 'internal' }]) // existing order

      const updatedOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        orderType: 'partner',
        limitMode: 'none',
        limitQuantity: null,
      }

      mockUpdate.returning.mockResolvedValueOnce([updatedOrder])
      mockSelect.where.mockResolvedValueOnce([]) // no FIO inventory (with sync time)
      mockSelect.where.mockResolvedValueOnce([{ count: 0, quantity: 0 }]) // reservation stats
      mockSelect.where.mockResolvedValueOnce([]) // fulfilled reservations

      const result = await controller.updateSellOrder(1, { orderType: 'partner' }, mockRequest)

      expect(result.orderType).toBe('partner')
      expect(permissionService.hasPermission).toHaveBeenCalledWith(
        ['member'],
        'orders.post_partner'
      )
    })

    it('should throw 403 when changing orderType without permission', async () => {
      mockSelect.where.mockResolvedValueOnce([{ id: 1, userId: 1, orderType: 'internal' }]) // existing order
      vi.mocked(permissionService.hasPermission).mockResolvedValueOnce(false)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.updateSellOrder(1, { orderType: 'partner' }, mockRequest)
      ).rejects.toThrow('You do not have permission to change this order to partner')
      expect(setStatusSpy).toHaveBeenCalledWith(403)
    })

    it('should update limit settings', async () => {
      mockSelect.where.mockResolvedValueOnce([{ id: 1, userId: 1, orderType: 'internal' }])

      const updatedOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        orderType: 'internal',
        limitMode: 'max_sell',
        limitQuantity: 300,
      }

      mockUpdate.returning.mockResolvedValueOnce([updatedOrder])
      mockSelect.where.mockResolvedValueOnce([{ quantity: 1000, lastSyncedAt: new Date() }])
      mockSelect.where.mockResolvedValueOnce([{ count: 0, quantity: 0 }]) // reservation stats
      mockSelect.where.mockResolvedValueOnce([{ total: 0 }]) // fulfilled total (max_sell uses sum query)

      const result = await controller.updateSellOrder(
        1,
        { limitMode: 'max_sell', limitQuantity: 300 },
        mockRequest
      )

      expect(result.limitMode).toBe('max_sell')
      expect(result.limitQuantity).toBe(300)
      expect(result.availableQuantity).toBe(300) // min(1000, 300)
    })

    it('should throw 404 when order not found', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.updateSellOrder(999, { price: 100 }, mockRequest)).rejects.toThrow(
        'Sell order not found'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('deleteSellOrder', () => {
    it('should delete a sell order', async () => {
      mockSelect.where.mockResolvedValueOnce([{ id: 1 }])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await controller.deleteSellOrder(1, mockRequest)

      expect(db.delete).toHaveBeenCalled()
      expect(setStatusSpy).toHaveBeenCalledWith(204)
    })

    it('should throw 404 when order not found', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.deleteSellOrder(999, mockRequest)).rejects.toThrow(
        'Sell order not found'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(404)
    })
  })

  describe('availability calculations', () => {
    it('should handle edge case: reserve more than inventory', async () => {
      const mockOrders = [
        {
          id: 1,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          orderType: 'internal',
          limitMode: 'reserve',
          limitQuantity: 1500, // Reserve more than we have
        },
      ]
      const mockInventory = [
        { commodityTicker: 'H2O', quantity: 1000, locationId: 'BEN', lastSyncedAt: new Date() },
      ]

      mockSelect.where
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockInventory)
        .mockReturnValueOnce(createWhereChainWithGroupBy([])) // reservation stats
        .mockResolvedValueOnce([]) // fulfilled reservations

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].fioQuantity).toBe(1000)
      expect(result[0].availableQuantity).toBe(0) // max(0, 1000 - 1500) = 0
    })

    it('should handle edge case: max_sell more than inventory', async () => {
      const mockOrders = [
        {
          id: 1,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          orderType: 'internal',
          limitMode: 'max_sell',
          limitQuantity: 2000, // Want to sell more than we have
        },
      ]
      const mockInventory = [
        { commodityTicker: 'H2O', quantity: 500, locationId: 'BEN', lastSyncedAt: new Date() },
      ]

      mockSelect.where
        .mockResolvedValueOnce(mockOrders)
        .mockResolvedValueOnce(mockInventory)
        .mockReturnValueOnce(createWhereChainWithGroupBy([])) // reservation stats
        .mockResolvedValueOnce([]) // fulfilled reservations

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].fioQuantity).toBe(500)
      expect(result[0].availableQuantity).toBe(500) // min(500, 2000) = 500
    })
  })
})
