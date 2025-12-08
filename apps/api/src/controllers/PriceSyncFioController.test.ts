import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PriceSyncFioController } from './PriceSyncFioController.js'

// Mock the FIO sync service
const mockSyncFioExchangePrices = vi.fn()
const mockGetFioExchangeSyncStatus = vi.fn()

vi.mock('../services/fio/index.js', () => ({
  syncFioExchangePrices: (exchangeCode?: string, priceField?: string) =>
    mockSyncFioExchangePrices(exchangeCode, priceField),
  getFioExchangeSyncStatus: () => mockGetFioExchangeSyncStatus(),
}))

describe('PriceSyncFioController', () => {
  let controller: PriceSyncFioController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new PriceSyncFioController()
  })

  describe('getSyncStatus', () => {
    it('should return sync status for all exchanges', async () => {
      const mockStatus = [
        {
          exchangeCode: 'CI1',
          locationId: 'BEN',
          lastSyncedAt: new Date('2025-12-07T12:00:00Z'),
          priceCount: 100,
        },
        {
          exchangeCode: 'NC1',
          locationId: 'MOR',
          lastSyncedAt: new Date('2025-12-07T11:00:00Z'),
          priceCount: 95,
        },
      ]

      mockGetFioExchangeSyncStatus.mockResolvedValue(mockStatus)

      const result = await controller.getSyncStatus()

      expect(result).toEqual(mockStatus)
      expect(mockGetFioExchangeSyncStatus).toHaveBeenCalledOnce()
    })

    it('should handle empty status', async () => {
      mockGetFioExchangeSyncStatus.mockResolvedValue([])

      const result = await controller.getSyncStatus()

      expect(result).toEqual([])
    })
  })

  describe('syncAllExchanges', () => {
    it('should sync all exchanges with default price field', async () => {
      const syncResult = {
        success: true,
        exchanges: [
          {
            exchangeCode: 'CI1',
            locationId: 'BEN',
            currency: 'CIS',
            pricesUpdated: 50,
            pricesSkipped: 5,
            syncedAt: new Date('2025-12-07T12:00:00Z'),
          },
        ],
        totalUpdated: 50,
        totalSkipped: 5,
        errors: [],
      }

      mockSyncFioExchangePrices.mockResolvedValue(syncResult)

      const result = await controller.syncAllExchanges()

      expect(result.success).toBe(true)
      expect(result.totalUpdated).toBe(50)
      expect(result.totalSkipped).toBe(5)
      expect(mockSyncFioExchangePrices).toHaveBeenCalledWith(undefined, 'PriceAverage')
    })

    it('should use custom price field when specified', async () => {
      const syncResult = {
        success: true,
        exchanges: [],
        totalUpdated: 0,
        totalSkipped: 0,
        errors: [],
      }

      mockSyncFioExchangePrices.mockResolvedValue(syncResult)

      await controller.syncAllExchanges({ priceField: 'MMBuy' })

      expect(mockSyncFioExchangePrices).toHaveBeenCalledWith(undefined, 'MMBuy')
    })

    it('should return errors when sync fails', async () => {
      const syncResult = {
        success: false,
        exchanges: [],
        totalUpdated: 0,
        totalSkipped: 0,
        errors: ['API connection failed'],
      }

      mockSyncFioExchangePrices.mockResolvedValue(syncResult)

      const result = await controller.syncAllExchanges()

      expect(result.success).toBe(false)
      expect(result.errors).toContain('API connection failed')
    })
  })

  describe('syncExchange', () => {
    it('should sync specific exchange', async () => {
      const syncResult = {
        success: true,
        exchanges: [
          {
            exchangeCode: 'CI1',
            locationId: 'BEN',
            currency: 'CIS',
            pricesUpdated: 50,
            pricesSkipped: 5,
            syncedAt: new Date('2025-12-07T12:00:00Z'),
          },
        ],
        totalUpdated: 50,
        totalSkipped: 5,
        errors: [],
      }

      mockSyncFioExchangePrices.mockResolvedValue(syncResult)

      const result = await controller.syncExchange('CI1')

      expect(result.success).toBe(true)
      expect(result.exchanges.length).toBe(1)
      expect(result.exchanges[0].exchangeCode).toBe('CI1')
      expect(mockSyncFioExchangePrices).toHaveBeenCalledWith('CI1', 'PriceAverage')
    })

    it('should convert exchange code to uppercase', async () => {
      const syncResult = {
        success: true,
        exchanges: [],
        totalUpdated: 0,
        totalSkipped: 0,
        errors: [],
      }

      mockSyncFioExchangePrices.mockResolvedValue(syncResult)

      await controller.syncExchange('ci1')

      expect(mockSyncFioExchangePrices).toHaveBeenCalledWith('CI1', 'PriceAverage')
    })

    it('should use custom price field when specified', async () => {
      const syncResult = {
        success: true,
        exchanges: [],
        totalUpdated: 0,
        totalSkipped: 0,
        errors: [],
      }

      mockSyncFioExchangePrices.mockResolvedValue(syncResult)

      await controller.syncExchange('CI1', 'Ask')

      expect(mockSyncFioExchangePrices).toHaveBeenCalledWith('CI1', 'Ask')
    })

    it('should return error for unknown exchange', async () => {
      const syncResult = {
        success: false,
        exchanges: [],
        totalUpdated: 0,
        totalSkipped: 0,
        errors: ["Exchange code 'UNKNOWN' not found or is not a FIO exchange"],
      }

      mockSyncFioExchangePrices.mockResolvedValue(syncResult)

      const result = await controller.syncExchange('UNKNOWN')

      expect(result.success).toBe(false)
      expect(result.errors.length).toBe(1)
    })
  })
})
