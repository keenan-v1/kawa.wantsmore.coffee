import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PriceListController } from './PriceListController.js'
import { db } from '../db/index.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  priceLists: {
    id: 'id',
    exchangeCode: 'exchangeCode',
    commodityTicker: 'commodityTicker',
    locationId: 'locationId',
    price: 'price',
    currency: 'currency',
    source: 'source',
    sourceReference: 'sourceReference',
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
}))

describe('PriceListController', () => {
  let controller: PriceListController
  let mockSelect: any
  let mockInsert: any
  let mockUpdate: any
  let mockDelete: any

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new PriceListController()

    mockSelect = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }

    mockInsert = {
      values: vi.fn().mockReturnThis(),
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

  describe('getPrices', () => {
    it('should return all prices without filters', async () => {
      const mockPrices = [
        {
          id: 1,
          exchangeCode: 'KAWA',
          commodityTicker: 'H2O',
          commodityName: 'Water',
          locationId: 'BEN',
          locationName: 'Benton Station',
          price: '100.00',
          currency: 'CIS',
          source: 'manual',
          sourceReference: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]
      mockSelect.orderBy.mockResolvedValue(mockPrices)

      const result = await controller.getPrices()

      expect(result).toEqual(mockPrices)
      expect(db.select).toHaveBeenCalled()
    })

    it('should filter by exchange', async () => {
      mockSelect.orderBy.mockResolvedValue([])

      await controller.getPrices('kawa')

      expect(mockSelect.where).toHaveBeenCalled()
    })

    it('should filter by multiple criteria', async () => {
      mockSelect.orderBy.mockResolvedValue([])

      await controller.getPrices('kawa', 'BEN', 'H2O', 'CIS')

      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getPricesByExchange', () => {
    it('should return prices for a specific exchange', async () => {
      const mockPrices = [
        {
          id: 1,
          exchangeCode: 'CI1',
          commodityTicker: 'H2O',
          commodityName: 'Water',
          locationId: 'BEN',
          locationName: 'Benton Station',
          price: '120.00',
          currency: 'CIS',
          source: 'fio_exchange',
          sourceReference: 'CI1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]
      mockSelect.orderBy.mockResolvedValue(mockPrices)

      const result = await controller.getPricesByExchange('ci1')

      expect(result).toEqual(mockPrices)
      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getPricesByExchangeAndLocation', () => {
    it('should return prices for a specific exchange and location', async () => {
      const mockPrices = [
        {
          id: 1,
          exchangeCode: 'KAWA',
          commodityTicker: 'H2O',
          commodityName: 'Water',
          locationId: 'BEN',
          locationName: 'Benton Station',
          price: '100.00',
          currency: 'CIS',
          source: 'manual',
          sourceReference: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]
      mockSelect.orderBy.mockResolvedValue(mockPrices)

      const result = await controller.getPricesByExchangeAndLocation('kawa', 'ben')

      expect(result).toEqual(mockPrices)
      expect(mockSelect.where).toHaveBeenCalled()
    })
  })

  describe('getPrice', () => {
    it('should return a specific price', async () => {
      const mockPrice = {
        id: 1,
        exchangeCode: 'KAWA',
        commodityTicker: 'H2O',
        commodityName: 'Water',
        locationId: 'BEN',
        locationName: 'Benton Station',
        price: '100.00',
        currency: 'CIS',
        source: 'manual',
        sourceReference: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }
      mockSelect.limit.mockResolvedValue([mockPrice])

      const result = await controller.getPrice('kawa', 'ben', 'h2o')

      expect(result).toEqual(mockPrice)
    })

    it('should throw NotFound when price does not exist', async () => {
      mockSelect.limit.mockResolvedValue([])

      await expect(controller.getPrice('kawa', 'ben', 'invalid')).rejects.toThrow(
        'Price for INVALID at BEN on KAWA not found'
      )
    })

    it('should filter by currency when provided', async () => {
      const mockPrice = {
        id: 1,
        exchangeCode: 'KAWA',
        commodityTicker: 'H2O',
        commodityName: 'Water',
        locationId: 'BEN',
        locationName: 'Benton Station',
        price: '100.00',
        currency: 'CIS',
        source: 'manual',
        sourceReference: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }
      mockSelect.limit.mockResolvedValue([mockPrice])

      const result = await controller.getPrice('kawa', 'ben', 'h2o', 'CIS')

      expect(result).toEqual(mockPrice)
    })
  })

  describe('createPrice', () => {
    it('should create a new price', async () => {
      // Mock for exchange check
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }

      // Mock for commodity check
      const mockCommoditySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ ticker: 'H2O' }]),
      }

      // Mock for location check
      const mockLocationSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }

      // Mock for existing price check
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }

      // Mock for return value
      const mockReturnSelect = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: 1,
            exchangeCode: 'KAWA',
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '100.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockExchangeSelect as any)
        .mockReturnValueOnce(mockCommoditySelect as any)
        .mockReturnValueOnce(mockLocationSelect as any)
        .mockReturnValueOnce(mockExistingSelect as any)
        .mockReturnValueOnce(mockReturnSelect as any)

      mockInsert.values.mockResolvedValue([])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      const result = await controller.createPrice({
        exchangeCode: 'kawa',
        commodityTicker: 'h2o',
        locationId: 'ben',
        price: 100,
        currency: 'CIS',
      })

      expect(result.exchangeCode).toBe('KAWA')
      expect(db.insert).toHaveBeenCalled()
      expect(setStatusSpy).toHaveBeenCalledWith(201)
    })

    it('should throw BadRequest when exchange does not exist', async () => {
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockExchangeSelect as any)

      await expect(
        controller.createPrice({
          exchangeCode: 'INVALID',
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: 100,
          currency: 'CIS',
        })
      ).rejects.toThrow("Exchange 'INVALID' not found")
    })

    it('should throw BadRequest when commodity does not exist', async () => {
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }
      const mockCommoditySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select)
        .mockReturnValueOnce(mockExchangeSelect as any)
        .mockReturnValueOnce(mockCommoditySelect as any)

      await expect(
        controller.createPrice({
          exchangeCode: 'KAWA',
          commodityTicker: 'INVALID',
          locationId: 'BEN',
          price: 100,
          currency: 'CIS',
        })
      ).rejects.toThrow("Commodity 'INVALID' not found")
    })

    it('should throw BadRequest when location does not exist', async () => {
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }
      const mockCommoditySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ ticker: 'H2O' }]),
      }
      const mockLocationSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select)
        .mockReturnValueOnce(mockExchangeSelect as any)
        .mockReturnValueOnce(mockCommoditySelect as any)
        .mockReturnValueOnce(mockLocationSelect as any)

      await expect(
        controller.createPrice({
          exchangeCode: 'KAWA',
          commodityTicker: 'H2O',
          locationId: 'INVALID',
          price: 100,
          currency: 'CIS',
        })
      ).rejects.toThrow("Location 'INVALID' not found")
    })

    it('should throw Conflict when price already exists', async () => {
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }
      const mockCommoditySelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ ticker: 'H2O' }]),
      }
      const mockLocationSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 1 }]),
      }
      vi.mocked(db.select)
        .mockReturnValueOnce(mockExchangeSelect as any)
        .mockReturnValueOnce(mockCommoditySelect as any)
        .mockReturnValueOnce(mockLocationSelect as any)
        .mockReturnValueOnce(mockExistingSelect as any)

      await expect(
        controller.createPrice({
          exchangeCode: 'KAWA',
          commodityTicker: 'H2O',
          locationId: 'BEN',
          price: 100,
          currency: 'CIS',
        })
      ).rejects.toThrow('Price for H2O at BEN on KAWA (CIS) already exists')
    })
  })

  describe('updatePrice', () => {
    it('should update an existing price', async () => {
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: 1,
            exchangeCode: 'KAWA',
            commodityTicker: 'H2O',
            locationId: 'BEN',
            currency: 'CIS',
          },
        ]),
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
            commodityTicker: 'H2O',
            commodityName: 'Water',
            locationId: 'BEN',
            locationName: 'Benton Station',
            price: '150.00',
            currency: 'CIS',
            source: 'manual',
            sourceReference: null,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-02'),
          },
        ]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockExistingSelect as any)
        .mockReturnValueOnce(mockReturnSelect as any)

      const result = await controller.updatePrice(1, { price: 150 })

      expect(result.price).toBe('150.00')
      expect(db.update).toHaveBeenCalled()
    })

    it('should throw NotFound when price does not exist', async () => {
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockExistingSelect as any)

      await expect(controller.updatePrice(999, { price: 100 })).rejects.toThrow(
        'Price with ID 999 not found'
      )
    })
  })

  describe('deletePrice', () => {
    it('should delete an existing price', async () => {
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 1 }]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockExistingSelect as any)

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await controller.deletePrice(1)

      expect(db.delete).toHaveBeenCalled()
      expect(setStatusSpy).toHaveBeenCalledWith(204)
    })

    it('should throw NotFound when price does not exist', async () => {
      const mockExistingSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockExistingSelect as any)

      await expect(controller.deletePrice(999)).rejects.toThrow('Price with ID 999 not found')
    })
  })
})
