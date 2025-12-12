import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PriceListsController } from './PriceListsController.js'

// Mock query result holders
let mockPriceListsResult: unknown[] = []
let mockPricesResult: unknown[] = []
let mockImportConfigsResult: unknown[] = []
let mockLocationsResult: unknown[] = []

vi.mock('../db/index.js', () => {
  // Use string markers for table identification
  const priceListsTable = { __table: 'priceLists' }
  const pricesTable = { __table: 'prices' }
  const priceAdjustmentsTable = { __table: 'priceAdjustments' }
  const importConfigsTable = { __table: 'importConfigs' }
  const fioLocationsTable = { __table: 'fioLocations' }

  return {
    db: {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: { __table: string }) => {
          const tableName = table?.__table || ''

          if (tableName === 'priceLists') {
            return {
              leftJoin: vi.fn().mockReturnThis(),
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockPriceListsResult)),
              })),
              orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockPriceListsResult)),
            }
          }
          if (tableName === 'prices') {
            // Make it thenable for direct await, also support where() chain
            const resultPromise = Promise.resolve(mockPricesResult)
            return Object.assign(resultPromise, {
              where: vi.fn().mockImplementation(() => Promise.resolve(mockPricesResult)),
            })
          }
          if (tableName === 'importConfigs') {
            // Make it thenable for direct await, also support where() chain
            const resultPromise = Promise.resolve(mockImportConfigsResult)
            return Object.assign(resultPromise, {
              where: vi.fn().mockImplementation(() => Promise.resolve(mockImportConfigsResult)),
            })
          }
          if (tableName === 'fioLocations') {
            return {
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockLocationsResult)),
              })),
            }
          }
          // Default fallback
          return {
            where: vi.fn().mockResolvedValue([]),
            leftJoin: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockResolvedValue([]),
          }
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    },
    priceLists: priceListsTable,
    prices: pricesTable,
    priceAdjustments: priceAdjustmentsTable,
    importConfigs: importConfigsTable,
    fioLocations: fioLocationsTable,
  }
})

describe('PriceListsController', () => {
  let controller: PriceListsController

  beforeEach(() => {
    controller = new PriceListsController()
    vi.clearAllMocks()
    // Reset arrays
    mockPriceListsResult = []
    mockPricesResult = []
    mockImportConfigsResult = []
    mockLocationsResult = []
  })

  describe('getPriceLists', () => {
    it('should return all price lists with counts', async () => {
      mockPriceListsResult = [
        {
          code: 'KAWA',
          name: 'KAWA Internal',
          description: 'Internal prices',
          type: 'custom',
          currency: 'CIS',
          defaultLocationId: null,
          defaultLocationName: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.getPriceLists()

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('KAWA')
      expect(result[0].priceCount).toBe(0)
      expect(result[0].importConfigCount).toBe(0)
    })

    it('should return empty array when no price lists', async () => {
      const result = await controller.getPriceLists()
      expect(result).toHaveLength(0)
    })
  })

  describe('getPriceList', () => {
    it('should return a specific price list', async () => {
      mockPriceListsResult = [
        {
          code: 'CI1',
          name: 'Benten Exchange',
          description: 'FIO CI1',
          type: 'fio',
          currency: 'CIS',
          defaultLocationId: 'BEN',
          defaultLocationName: 'Benten',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.getPriceList('ci1')

      expect(result.code).toBe('CI1')
      expect(result.name).toBe('Benten Exchange')
    })

    it('should throw NotFound when price list does not exist', async () => {
      mockPriceListsResult = []
      await expect(controller.getPriceList('INVALID')).rejects.toThrow()
    })
  })

  describe('deletePriceList', () => {
    it('should not allow deleting FIO price lists', async () => {
      mockPriceListsResult = [
        {
          code: 'CI1',
          type: 'fio',
        },
      ]

      await expect(controller.deletePriceList('CI1')).rejects.toThrow(
        'Cannot delete FIO price lists'
      )
    })

    it('should throw NotFound when deleting non-existent price list', async () => {
      mockPriceListsResult = []
      await expect(controller.deletePriceList('INVALID')).rejects.toThrow()
    })

    it('should delete a custom price list successfully', async () => {
      mockPriceListsResult = [
        {
          code: 'CUSTOM',
          type: 'custom',
        },
      ]
      controller.setStatus = vi.fn()

      await controller.deletePriceList('CUSTOM')

      expect(controller.setStatus).toHaveBeenCalledWith(204)
    })
  })
})
