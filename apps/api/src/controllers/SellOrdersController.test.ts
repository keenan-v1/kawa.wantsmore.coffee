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
    limitMode: 'limitMode',
    limitQuantity: 'limitQuantity',
    targetRoleId: 'targetRoleId',
    updatedAt: 'updatedAt',
  },
  fioInventory: {
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    quantity: 'quantity',
  },
  commodities: {
    ticker: 'ticker',
  },
  locations: {
    id: 'id',
  },
  roles: {
    id: 'id',
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

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SellOrdersController()

    mockSelect = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
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
      const mockOrders = [
        {
          id: 1,
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: '100.00',
          currency: 'CIS',
          limitMode: 'none',
          limitQuantity: null,
          targetRoleId: null,
          fioQuantity: 1000,
        },
        {
          id: 2,
          commodityTicker: 'RAT',
          locationId: 'BEN',
          price: '50.00',
          currency: 'CIS',
          limitMode: 'max_sell',
          limitQuantity: 200,
          targetRoleId: null,
          fioQuantity: 500,
        },
      ]

      mockSelect.where.mockResolvedValueOnce(mockOrders)

      const result = await controller.getSellOrders(mockRequest)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: 100,
        currency: 'CIS',
        limitMode: 'none',
        limitQuantity: null,
        targetRoleId: null,
        fioQuantity: 1000,
        availableQuantity: 1000, // none mode: full quantity
      })
      expect(result[1]).toEqual({
        id: 2,
        commodityTicker: 'RAT',
        locationId: 'BEN',
        price: 50,
        currency: 'CIS',
        limitMode: 'max_sell',
        limitQuantity: 200,
        targetRoleId: null,
        fioQuantity: 500,
        availableQuantity: 200, // max_sell mode: min(500, 200)
      })
    })

    it('should calculate reserve mode correctly', async () => {
      const mockOrders = [{
        id: 1,
        commodityTicker: 'CAF',
        locationId: 'BEN',
        price: '75.00',
        currency: 'CIS',
        limitMode: 'reserve',
        limitQuantity: 500,
        targetRoleId: null,
        fioQuantity: 2000,
      }]

      mockSelect.where.mockResolvedValueOnce(mockOrders)

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].availableQuantity).toBe(1500) // reserve mode: max(0, 2000 - 500)
    })

    it('should handle null FIO inventory', async () => {
      const mockOrders = [{
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        limitMode: 'none',
        limitQuantity: null,
        targetRoleId: null,
        fioQuantity: null, // No FIO inventory
      }]

      mockSelect.where.mockResolvedValueOnce(mockOrders)

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].fioQuantity).toBe(0)
      expect(result[0].availableQuantity).toBe(0)
    })

    it('should return empty array when no orders exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const result = await controller.getSellOrders(mockRequest)

      expect(result).toEqual([])
    })

    it('should return orders with targetRoleId', async () => {
      const mockOrders = [{
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        limitMode: 'none',
        limitQuantity: null,
        targetRoleId: 'trade-partner',
        fioQuantity: 1000,
      }]

      mockSelect.where.mockResolvedValueOnce(mockOrders)

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].targetRoleId).toBe('trade-partner')
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
        limitMode: 'none',
        limitQuantity: null,
        targetRoleId: null,
        fioQuantity: 1000,
      }

      mockSelect.where.mockResolvedValueOnce([mockOrder])

      const result = await controller.getSellOrder(1, mockRequest)

      expect(result.id).toBe(1)
      expect(result.commodityTicker).toBe('H2O')
      expect(result.availableQuantity).toBe(1000)
      expect(result.targetRoleId).toBeNull()
    })

    it('should throw 404 when order not found', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.getSellOrder(999, mockRequest)).rejects.toThrow('Sell order not found')
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
        limitMode: 'none',
        limitQuantity: null,
        targetRoleId: null,
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
      expect(result.targetRoleId).toBeNull()
      expect(setStatusSpy).toHaveBeenCalledWith(201)
      expect(permissionService.hasPermission).toHaveBeenCalledWith(['member'], 'orders.post_internal')
    })

    it('should create external order when user has permission', async () => {
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'H2O' }]) // commodity exists
        .mockResolvedValueOnce([{ id: 'BEN' }]) // location exists
        .mockResolvedValueOnce([{ id: 'trade-partner' }]) // target role exists
        .mockResolvedValueOnce([]) // no duplicate
        .mockResolvedValueOnce([]) // no FIO inventory

      const newOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        limitMode: 'none',
        limitQuantity: null,
        targetRoleId: 'trade-partner',
      }

      mockInsert.returning.mockResolvedValueOnce([newOrder])

      const result = await controller.createSellOrder(
        {
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: 100,
          currency: 'CIS',
          targetRoleId: 'trade-partner',
        },
        mockRequest
      )

      expect(result.targetRoleId).toBe('trade-partner')
      expect(permissionService.hasPermission).toHaveBeenCalledWith(['member'], 'orders.post_external')
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

    it('should throw 403 when user lacks permission to post external orders', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValueOnce(false)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.createSellOrder(
          {
            commodityTicker: 'H2O',
            locationId: 'BEN',
            price: 100,
            currency: 'CIS',
            targetRoleId: 'trade-partner',
          },
          mockRequest
        )
      ).rejects.toThrow('You do not have permission to create external orders')
      expect(setStatusSpy).toHaveBeenCalledWith(403)
    })

    it('should throw 400 when target role does not exist', async () => {
      mockSelect.where
        .mockResolvedValueOnce([{ ticker: 'H2O' }]) // commodity exists
        .mockResolvedValueOnce([{ id: 'BEN' }]) // location exists
        .mockResolvedValueOnce([]) // target role NOT found

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.createSellOrder(
          {
            commodityTicker: 'H2O',
            locationId: 'BEN',
            price: 100,
            currency: 'CIS',
            targetRoleId: 'invalid-role',
          },
          mockRequest
        )
      ).rejects.toThrow('Target role invalid-role not found')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
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

    it('should throw 400 when duplicate order exists', async () => {
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
      ).rejects.toThrow('Sell order already exists')
      expect(setStatusSpy).toHaveBeenCalledWith(400)
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
        limitMode: 'reserve',
        limitQuantity: 500,
        targetRoleId: null,
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
      mockSelect.where.mockResolvedValueOnce([{ id: 1, userId: 1 }]) // existing order

      const updatedOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '150.00',
        currency: 'CIS',
        limitMode: 'none',
        limitQuantity: null,
        targetRoleId: null,
      }

      mockUpdate.returning.mockResolvedValueOnce([updatedOrder])
      mockSelect.where.mockResolvedValueOnce([]) // no FIO inventory

      const result = await controller.updateSellOrder(
        1,
        { price: 150 },
        mockRequest
      )

      expect(result.price).toBe(150)
      expect(db.update).toHaveBeenCalled()
    })

    it('should update targetRoleId when user has permission', async () => {
      mockSelect.where
        .mockResolvedValueOnce([{ id: 1, userId: 1 }]) // existing order
        .mockResolvedValueOnce([{ id: 'trade-partner' }]) // target role exists

      const updatedOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        limitMode: 'none',
        limitQuantity: null,
        targetRoleId: 'trade-partner',
      }

      mockUpdate.returning.mockResolvedValueOnce([updatedOrder])
      mockSelect.where.mockResolvedValueOnce([]) // no FIO inventory

      const result = await controller.updateSellOrder(
        1,
        { targetRoleId: 'trade-partner' },
        mockRequest
      )

      expect(result.targetRoleId).toBe('trade-partner')
      expect(permissionService.hasPermission).toHaveBeenCalledWith(['member'], 'orders.post_external')
    })

    it('should throw 403 when changing targetRoleId without permission', async () => {
      mockSelect.where.mockResolvedValueOnce([{ id: 1, userId: 1 }]) // existing order
      vi.mocked(permissionService.hasPermission).mockResolvedValueOnce(false)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.updateSellOrder(
          1,
          { targetRoleId: 'trade-partner' },
          mockRequest
        )
      ).rejects.toThrow('You do not have permission to change this order to external')
      expect(setStatusSpy).toHaveBeenCalledWith(403)
    })

    it('should update limit settings', async () => {
      mockSelect.where.mockResolvedValueOnce([{ id: 1, userId: 1 }])

      const updatedOrder = {
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        limitMode: 'max_sell',
        limitQuantity: 300,
        targetRoleId: null,
      }

      mockUpdate.returning.mockResolvedValueOnce([updatedOrder])
      mockSelect.where.mockResolvedValueOnce([{ quantity: 1000 }])

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

      await expect(
        controller.updateSellOrder(999, { price: 100 }, mockRequest)
      ).rejects.toThrow('Sell order not found')
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
      const mockOrders = [{
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        limitMode: 'reserve',
        limitQuantity: 1500, // Reserve more than we have
        targetRoleId: null,
        fioQuantity: 1000,
      }]

      mockSelect.where.mockResolvedValueOnce(mockOrders)

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].availableQuantity).toBe(0) // max(0, 1000 - 1500) = 0
    })

    it('should handle edge case: max_sell more than inventory', async () => {
      const mockOrders = [{
        id: 1,
        commodityTicker: 'H2O',
        locationId: 'BEN',
        price: '100.00',
        currency: 'CIS',
        limitMode: 'max_sell',
        limitQuantity: 2000, // Want to sell more than we have
        targetRoleId: null,
        fioQuantity: 500,
      }]

      mockSelect.where.mockResolvedValueOnce(mockOrders)

      const result = await controller.getSellOrders(mockRequest)

      expect(result[0].availableQuantity).toBe(500) // min(500, 2000) = 500
    })
  })
})
