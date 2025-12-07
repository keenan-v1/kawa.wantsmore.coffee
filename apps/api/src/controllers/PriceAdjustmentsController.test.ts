import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PriceAdjustmentsController } from './PriceAdjustmentsController.js'
import { db } from '../db/index.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  priceAdjustments: {
    id: 'id',
    exchangeCode: 'exchangeCode',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    currency: 'currency',
    adjustmentType: 'adjustmentType',
    adjustmentValue: 'adjustmentValue',
    priority: 'priority',
    description: 'description',
    isActive: 'isActive',
    effectiveFrom: 'effectiveFrom',
    effectiveUntil: 'effectiveUntil',
    createdByUserId: 'createdByUserId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  fioCommodities: {
    ticker: 'ticker',
    name: 'name',
  },
  fioLocations: {
    naturalId: 'naturalId',
    name: 'name',
  },
  fioExchanges: {
    code: 'code',
  },
  users: {
    id: 'id',
    username: 'username',
  },
}))

const mockRequest: AuthenticatedRequest = {
  user: {
    id: 1,
    username: 'testuser',
    permissions: ['adjustments.manage'],
  },
} as unknown as AuthenticatedRequest

describe('PriceAdjustmentsController', () => {
  let controller: PriceAdjustmentsController
  let mockSelect: any
  let mockInsert: any
  let mockUpdate: any
  let mockDelete: any

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new PriceAdjustmentsController()

    mockSelect = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }

    mockInsert = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    }

    mockUpdate = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    }

    mockDelete = {
      where: vi.fn().mockResolvedValue([]),
    }

    vi.mocked(db.select).mockReturnValue(mockSelect)
    vi.mocked(db.insert).mockReturnValue(mockInsert)
    vi.mocked(db.update).mockReturnValue(mockUpdate)
    vi.mocked(db.delete).mockReturnValue(mockDelete)
  })

  describe('getAdjustments', () => {
    it('should return all adjustments without filters', async () => {
      const mockAdjustments = [
        {
          id: 1,
          exchangeCode: 'KAWA',
          commodityTicker: null,
          commodityName: null,
          locationId: null,
          locationName: null,
          currency: null,
          adjustmentType: 'percentage',
          adjustmentValue: '10.0000',
          priority: 0,
          description: 'Global KAWA markup',
          isActive: true,
          effectiveFrom: null,
          effectiveUntil: null,
          createdByUserId: 1,
          createdByUsername: 'admin',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]
      mockSelect.orderBy.mockResolvedValue(mockAdjustments)

      const result = await controller.getAdjustments()

      expect(result).toEqual(mockAdjustments)
      expect(db.select).toHaveBeenCalled()
    })

    it('should filter by exchange', async () => {
      mockSelect.orderBy.mockResolvedValue([])

      await controller.getAdjustments('kawa')

      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('should filter by active only', async () => {
      mockSelect.orderBy.mockResolvedValue([])

      await controller.getAdjustments(undefined, undefined, true)

      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getAdjustmentsByExchange', () => {
    it('should return adjustments for a specific exchange', async () => {
      const mockAdjustments = [
        {
          id: 1,
          exchangeCode: 'KAWA',
          commodityTicker: null,
          commodityName: null,
          locationId: null,
          locationName: null,
          currency: null,
          adjustmentType: 'percentage',
          adjustmentValue: '10.0000',
          priority: 0,
          description: 'KAWA markup',
          isActive: true,
          effectiveFrom: null,
          effectiveUntil: null,
          createdByUserId: 1,
          createdByUsername: 'admin',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]
      mockSelect.orderBy.mockResolvedValue(mockAdjustments)

      const result = await controller.getAdjustmentsByExchange('kawa')

      expect(result).toEqual(mockAdjustments)
      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getAdjustmentsByLocation', () => {
    it('should return adjustments for a specific location', async () => {
      const mockAdjustments = [
        {
          id: 1,
          exchangeCode: null,
          commodityTicker: null,
          commodityName: null,
          locationId: 'BEN',
          locationName: 'Benton Station',
          currency: null,
          adjustmentType: 'fixed',
          adjustmentValue: '50.0000',
          priority: 0,
          description: 'BEN station fees',
          isActive: true,
          effectiveFrom: null,
          effectiveUntil: null,
          createdByUserId: 1,
          createdByUsername: 'admin',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]
      mockSelect.orderBy.mockResolvedValue(mockAdjustments)

      const result = await controller.getAdjustmentsByLocation('ben')

      expect(result).toEqual(mockAdjustments)
      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getAdjustment', () => {
    it('should return a specific adjustment', async () => {
      const mockAdjustment = {
        id: 1,
        exchangeCode: 'KAWA',
        commodityTicker: null,
        commodityName: null,
        locationId: null,
        locationName: null,
        currency: null,
        adjustmentType: 'percentage',
        adjustmentValue: '10.0000',
        priority: 0,
        description: 'KAWA markup',
        isActive: true,
        effectiveFrom: null,
        effectiveUntil: null,
        createdByUserId: 1,
        createdByUsername: 'admin',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }
      mockSelect.limit.mockResolvedValue([mockAdjustment])

      const result = await controller.getAdjustment(1)

      expect(result).toEqual(mockAdjustment)
    })

    it('should throw NotFound when adjustment does not exist', async () => {
      mockSelect.limit.mockResolvedValue([])

      await expect(controller.getAdjustment(999)).rejects.toThrow(
        'Adjustment with ID 999 not found'
      )
    })
  })

  describe('createAdjustment', () => {
    it('should create a new adjustment', async () => {
      const mockReturnAdjustment = {
        id: 1,
        exchangeCode: 'KAWA',
        commodityTicker: null,
        commodityName: null,
        locationId: null,
        locationName: null,
        currency: null,
        adjustmentType: 'percentage',
        adjustmentValue: '10.0000',
        priority: 0,
        description: 'KAWA markup',
        isActive: true,
        effectiveFrom: null,
        effectiveUntil: null,
        createdByUserId: 1,
        createdByUsername: 'testuser',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      // Mock for exchange validation
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }

      // Mock for returning the created adjustment
      const mockReturnSelect = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockReturnAdjustment]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockExchangeSelect as any)
        .mockReturnValueOnce(mockReturnSelect as any)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const result = await controller.createAdjustment(
        {
          exchangeCode: 'kawa',
          adjustmentType: 'percentage',
          adjustmentValue: 10,
          description: 'KAWA markup',
        },
        mockRequest
      )

      expect(result.exchangeCode).toBe('KAWA')
      expect(db.insert).toHaveBeenCalled()
      expect(setStatusSpy).toHaveBeenCalledWith(201)
    })

    it('should create global adjustment with no exchange/location/commodity', async () => {
      const mockReturnAdjustment = {
        id: 1,
        exchangeCode: null,
        commodityTicker: null,
        commodityName: null,
        locationId: null,
        locationName: null,
        currency: null,
        adjustmentType: 'percentage',
        adjustmentValue: '5.0000',
        priority: 0,
        description: 'Global adjustment',
        isActive: true,
        effectiveFrom: null,
        effectiveUntil: null,
        createdByUserId: 1,
        createdByUsername: 'testuser',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      const mockReturnSelect = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockReturnAdjustment]),
      }

      vi.mocked(db.select).mockReturnValueOnce(mockReturnSelect as any)

      const result = await controller.createAdjustment(
        {
          adjustmentType: 'percentage',
          adjustmentValue: 5,
          description: 'Global adjustment',
        },
        mockRequest
      )

      expect(result.exchangeCode).toBeNull()
      expect(result.locationId).toBeNull()
      expect(result.commodityTicker).toBeNull()
    })

    it('should throw BadRequest when exchange does not exist', async () => {
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockExchangeSelect as any)

      await expect(
        controller.createAdjustment(
          {
            exchangeCode: 'INVALID',
            adjustmentType: 'percentage',
            adjustmentValue: 10,
          },
          mockRequest
        )
      ).rejects.toThrow("Exchange 'INVALID' not found")
    })

    it('should throw BadRequest when commodity does not exist', async () => {
      const mockCommoditySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockCommoditySelect as any)

      await expect(
        controller.createAdjustment(
          {
            commodityTicker: 'INVALID',
            adjustmentType: 'percentage',
            adjustmentValue: 10,
          },
          mockRequest
        )
      ).rejects.toThrow("Commodity 'INVALID' not found")
    })

    it('should throw BadRequest when location does not exist', async () => {
      const mockLocationSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockLocationSelect as any)

      await expect(
        controller.createAdjustment(
          {
            locationId: 'INVALID',
            adjustmentType: 'percentage',
            adjustmentValue: 10,
          },
          mockRequest
        )
      ).rejects.toThrow("Location 'INVALID' not found")
    })
  })

  describe('updateAdjustment', () => {
    it('should update an existing adjustment', async () => {
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 1 }]),
      }

      const mockReturnSelect = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: 1,
            exchangeCode: 'KAWA',
            commodityTicker: null,
            commodityName: null,
            locationId: null,
            locationName: null,
            currency: null,
            adjustmentType: 'percentage',
            adjustmentValue: '15.0000',
            priority: 0,
            description: 'Updated markup',
            isActive: true,
            effectiveFrom: null,
            effectiveUntil: null,
            createdByUserId: 1,
            createdByUsername: 'admin',
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-02'),
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockExistingSelect as any)
        .mockReturnValueOnce(mockReturnSelect as any)

      const result = await controller.updateAdjustment(1, {
        adjustmentValue: 15,
        description: 'Updated markup',
      })

      expect(result.adjustmentValue).toBe('15.0000')
      expect(db.update).toHaveBeenCalled()
    })

    it('should throw NotFound when adjustment does not exist', async () => {
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockExistingSelect as any)

      await expect(controller.updateAdjustment(999, { isActive: false })).rejects.toThrow(
        'Adjustment with ID 999 not found'
      )
    })
  })

  describe('deleteAdjustment', () => {
    it('should delete an existing adjustment', async () => {
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 1 }]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockExistingSelect as any)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await controller.deleteAdjustment(1)

      expect(db.delete).toHaveBeenCalled()
      expect(setStatusSpy).toHaveBeenCalledWith(204)
    })

    it('should throw NotFound when adjustment does not exist', async () => {
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockExistingSelect as any)

      await expect(controller.deleteAdjustment(999)).rejects.toThrow(
        'Adjustment with ID 999 not found'
      )
    })
  })
})
