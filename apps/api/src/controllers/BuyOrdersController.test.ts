import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BuyOrdersController } from './BuyOrdersController.js'
import { db } from '../db/index.js'
import * as permissionService from '../utils/permissionService.js'
import * as priceCalculator from '../services/price-calculator.js'

vi.mock('../utils/permissionService.js', () => ({
  hasPermission: vi.fn(),
}))

vi.mock('../services/price-calculator.js', () => ({
  calculateEffectivePriceWithFallback: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  buyOrders: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    quantity: 'quantity',
    price: 'price',
    currency: 'currency',
    priceListCode: 'priceListCode',
    orderType: 'orderType',
    updatedAt: 'updatedAt',
  },
  fioCommodities: {
    ticker: 'ticker',
  },
  fioLocations: {
    naturalId: 'naturalId',
  },
  orderReservations: {
    buyOrderId: 'buyOrderId',
    status: 'status',
    quantity: 'quantity',
  },
}))

describe('BuyOrdersController', () => {
  let controller: BuyOrdersController
  let mockSelect: any
  let mockInsert: any
  let mockUpdate: any
  let mockDelete: any
  const mockRequest = { user: { userId: 42, username: 'testuser', roles: ['member'] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new BuyOrdersController()

    // Default: allow all permissions
    vi.mocked(permissionService.hasPermission).mockResolvedValue(true)

    // Default: no dynamic pricing
    vi.mocked(priceCalculator.calculateEffectivePriceWithFallback).mockResolvedValue(null)

    // Create mock chain
    mockSelect = {} as any
    mockSelect.from = vi.fn().mockReturnValue(mockSelect)
    mockSelect.where = vi.fn().mockReturnValue(mockSelect)
    mockSelect.groupBy = vi.fn().mockReturnValue(mockSelect)

    mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    }
    mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    }
    mockDelete = {
      where: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(db.select).mockReturnValue(mockSelect)
    vi.mocked(db.insert).mockReturnValue(mockInsert)
    vi.mocked(db.update).mockReturnValue(mockUpdate)
    vi.mocked(db.delete).mockReturnValue(mockDelete)
  })

  const mockOrder = {
    id: 1,
    userId: 42,
    commodityTicker: 'H2O',
    locationId: 'BEN',
    quantity: 100,
    price: '50.00',
    currency: 'CIS' as const,
    priceListCode: null,
    orderType: 'internal' as const,
  }

  describe('getBuyOrders', () => {
    it('should return all buy orders for the user', async () => {
      // First query returns orders
      mockSelect.where.mockResolvedValueOnce([mockOrder])
      // Second query returns reservation stats (empty)
      mockSelect.groupBy.mockResolvedValueOnce([])

      const result = await controller.getBuyOrders(mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(1)
      expect(result[0].commodityTicker).toBe('H2O')
      expect(result[0].price).toBe(50)
      expect(result[0].pricingMode).toBe('fixed')
    })

    it('should return empty array when no orders', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const result = await controller.getBuyOrders(mockRequest)

      expect(result).toHaveLength(0)
    })

    it('should include reservation counts', async () => {
      mockSelect.where.mockResolvedValueOnce([mockOrder])
      mockSelect.groupBy.mockResolvedValueOnce([
        { buyOrderId: 1, count: 2, quantity: 50, fulfilledQuantity: 10 },
      ])

      const result = await controller.getBuyOrders(mockRequest)

      expect(result[0].activeReservationCount).toBe(2)
      expect(result[0].reservedQuantity).toBe(50)
      expect(result[0].fulfilledQuantity).toBe(10)
      expect(result[0].remainingQuantity).toBe(40)
    })

    it('should calculate effective price for dynamic pricing', async () => {
      const dynamicOrder = { ...mockOrder, priceListCode: 'KAWA' }
      mockSelect.where.mockResolvedValueOnce([dynamicOrder])
      mockSelect.groupBy.mockResolvedValueOnce([])
      vi.mocked(priceCalculator.calculateEffectivePriceWithFallback).mockResolvedValueOnce({
        finalPrice: 55,
        isFallback: false,
        locationId: 'BEN',
      })

      const result = await controller.getBuyOrders(mockRequest)

      expect(result[0].pricingMode).toBe('dynamic')
      expect(result[0].effectivePrice).toBe(55)
    })
  })

  describe('getBuyOrder', () => {
    it('should return a specific buy order', async () => {
      mockSelect.where.mockResolvedValueOnce([mockOrder])
      // Reservation count query
      mockSelect.where.mockResolvedValueOnce([{ count: 0, quantity: 0, fulfilledQuantity: 0 }])

      const result = await controller.getBuyOrder(1, mockRequest)

      expect(result.id).toBe(1)
      expect(result.commodityTicker).toBe('H2O')
    })

    it('should throw NotFound when order does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.getBuyOrder(999, mockRequest)).rejects.toThrow('Buy order not found')
    })

    it('should handle fallback pricing', async () => {
      const dynamicOrder = { ...mockOrder, priceListCode: 'KAWA' }
      mockSelect.where.mockResolvedValueOnce([dynamicOrder])
      mockSelect.where.mockResolvedValueOnce([{ count: 0, quantity: 0, fulfilledQuantity: 0 }])
      vi.mocked(priceCalculator.calculateEffectivePriceWithFallback).mockResolvedValueOnce({
        finalPrice: 60,
        isFallback: true,
        locationId: 'ANT',
      })

      const result = await controller.getBuyOrder(1, mockRequest)

      expect(result.isFallback).toBe(true)
      expect(result.priceLocationId).toBe('ANT')
    })
  })

  describe('createBuyOrder', () => {
    const createBody = {
      commodityTicker: 'H2O',
      locationId: 'BEN',
      quantity: 100,
      price: 50,
      currency: 'CIS' as const,
    }

    it('should create a buy order', async () => {
      // Commodity lookup
      mockSelect.where.mockResolvedValueOnce([{ ticker: 'H2O' }])
      // Location lookup
      mockSelect.where.mockResolvedValueOnce([{ naturalId: 'BEN' }])
      // Duplicate check
      mockSelect.where.mockResolvedValueOnce([])
      // Insert returning
      mockInsert.returning.mockResolvedValueOnce([mockOrder])

      const result = await controller.createBuyOrder(createBody, mockRequest)

      expect(result.id).toBe(1)
      expect(result.commodityTicker).toBe('H2O')
      expect(result.remainingQuantity).toBe(100)
    })

    it('should throw error for invalid quantity', async () => {
      const body = { ...createBody, quantity: 0 }

      await expect(controller.createBuyOrder(body, mockRequest)).rejects.toThrow(
        'Quantity must be greater than 0'
      )
    })

    it('should throw error for non-existent commodity', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.createBuyOrder(createBody, mockRequest)).rejects.toThrow(
        'Commodity H2O not found'
      )
    })

    it('should throw error for non-existent location', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ticker: 'H2O' }])
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.createBuyOrder(createBody, mockRequest)).rejects.toThrow(
        'Location BEN not found'
      )
    })

    it('should throw error for duplicate order', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ticker: 'H2O' }])
      mockSelect.where.mockResolvedValueOnce([{ naturalId: 'BEN' }])
      mockSelect.where.mockResolvedValueOnce([{ id: 1 }]) // Existing order

      await expect(controller.createBuyOrder(createBody, mockRequest)).rejects.toThrow(
        'Buy order already exists'
      )
    })

    it('should throw error when user lacks permission for partner orders', async () => {
      vi.mocked(permissionService.hasPermission).mockResolvedValue(false)
      const body = { ...createBody, orderType: 'partner' as const }

      await expect(controller.createBuyOrder(body, mockRequest)).rejects.toThrow(
        'You do not have permission to create partner orders'
      )
    })

    it('should throw error when price is non-zero with price list', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ticker: 'H2O' }])
      mockSelect.where.mockResolvedValueOnce([{ naturalId: 'BEN' }])
      mockSelect.where.mockResolvedValueOnce([])
      const body = { ...createBody, priceListCode: 'KAWA', price: 50 }

      await expect(controller.createBuyOrder(body, mockRequest)).rejects.toThrow(
        'Price must be 0 when using a price list'
      )
    })

    it('should throw error when price is zero without price list', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ticker: 'H2O' }])
      mockSelect.where.mockResolvedValueOnce([{ naturalId: 'BEN' }])
      mockSelect.where.mockResolvedValueOnce([])
      const body = { ...createBody, price: 0 }

      await expect(controller.createBuyOrder(body, mockRequest)).rejects.toThrow(
        'Price must be greater than 0 for custom pricing'
      )
    })

    it('should create dynamic pricing order', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ticker: 'H2O' }])
      mockSelect.where.mockResolvedValueOnce([{ naturalId: 'BEN' }])
      mockSelect.where.mockResolvedValueOnce([])
      const dynamicOrder = { ...mockOrder, priceListCode: 'KAWA', price: '0.00' }
      mockInsert.returning.mockResolvedValueOnce([dynamicOrder])
      vi.mocked(priceCalculator.calculateEffectivePriceWithFallback).mockResolvedValueOnce({
        finalPrice: 55,
        isFallback: false,
        locationId: 'BEN',
      })
      const body = { ...createBody, priceListCode: 'KAWA', price: 0 }

      const result = await controller.createBuyOrder(body, mockRequest)

      expect(result.pricingMode).toBe('dynamic')
      expect(result.effectivePrice).toBe(55)
    })
  })

  describe('updateBuyOrder', () => {
    it('should update a buy order', async () => {
      mockSelect.where.mockResolvedValueOnce([mockOrder])
      mockUpdate.returning.mockResolvedValueOnce([{ ...mockOrder, quantity: 200 }])
      mockSelect.where.mockResolvedValueOnce([{ count: 0, quantity: 0, fulfilledQuantity: 0 }])

      const result = await controller.updateBuyOrder(1, { quantity: 200 }, mockRequest)

      expect(result.quantity).toBe(200)
    })

    it('should throw NotFound when order does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.updateBuyOrder(999, { quantity: 200 }, mockRequest)).rejects.toThrow(
        'Buy order not found'
      )
    })

    it('should throw error for invalid quantity', async () => {
      mockSelect.where.mockResolvedValueOnce([mockOrder])

      await expect(controller.updateBuyOrder(1, { quantity: -1 }, mockRequest)).rejects.toThrow(
        'Quantity must be greater than 0'
      )
    })

    it('should check permission when changing order type', async () => {
      mockSelect.where.mockResolvedValueOnce([mockOrder])
      vi.mocked(permissionService.hasPermission).mockResolvedValue(false)

      await expect(
        controller.updateBuyOrder(1, { orderType: 'partner' }, mockRequest)
      ).rejects.toThrow('You do not have permission to change this order to partner')
    })

    it('should validate dynamic pricing price', async () => {
      mockSelect.where.mockResolvedValueOnce([{ ...mockOrder, priceListCode: 'KAWA' }])

      await expect(controller.updateBuyOrder(1, { price: 50 }, mockRequest)).rejects.toThrow(
        'Price must be 0 when using a price list'
      )
    })

    it('should validate custom pricing price', async () => {
      mockSelect.where.mockResolvedValueOnce([mockOrder])

      await expect(controller.updateBuyOrder(1, { price: 0 }, mockRequest)).rejects.toThrow(
        'Price must be greater than 0 for custom pricing'
      )
    })
  })

  describe('deleteBuyOrder', () => {
    it('should delete a buy order', async () => {
      mockSelect.where.mockResolvedValueOnce([{ id: 1 }])

      await controller.deleteBuyOrder(1, mockRequest)

      expect(mockDelete.where).toHaveBeenCalled()
    })

    it('should throw NotFound when order does not exist', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      await expect(controller.deleteBuyOrder(999, mockRequest)).rejects.toThrow(
        'Buy order not found'
      )
    })
  })
})
