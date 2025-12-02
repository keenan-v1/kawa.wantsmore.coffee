import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FioInventoryController } from './FioInventoryController.js'
import { db } from '../db/index.js'
import * as syncUserInventoryModule from '../services/fio/sync-user-inventory.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  },
  userSettings: {
    userId: 'userId',
    fioUsername: 'fioUsername',
    fioApiKey: 'fioApiKey',
  },
  fioInventory: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    quantity: 'quantity',
    locationId: 'locationId',
    lastSyncedAt: 'lastSyncedAt',
  },
  commodities: {
    ticker: 'ticker',
    name: 'name',
    category: 'category',
  },
  locations: {
    id: 'id',
    name: 'name',
    type: 'type',
  },
}))

vi.mock('../services/fio/sync-user-inventory.js', () => ({
  syncUserInventory: vi.fn(),
}))

describe('FioInventoryController', () => {
  let controller: FioInventoryController
  let mockSelect: any
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: [] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new FioInventoryController()
    mockSelect = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    vi.mocked(db.select).mockReturnValue(mockSelect)
  })

  describe('getInventory', () => {
    it('should return user FIO inventory with commodity and location details', async () => {
      const mockItems = [
        {
          id: 1,
          commodityTicker: 'H2O',
          quantity: 1000,
          locationId: 'BEN',
          lastSyncedAt: new Date('2024-01-01T00:00:00Z'),
          commodityName: 'Water',
          commodityCategory: 'consumables',
          locationName: 'Benton Station',
          locationType: 'Station',
        },
        {
          id: 2,
          commodityTicker: 'RAT',
          quantity: 500,
          locationId: 'UV-351a',
          lastSyncedAt: new Date('2024-01-01T00:00:00Z'),
          commodityName: 'Rations',
          commodityCategory: 'consumables',
          locationName: 'Katoa',
          locationType: 'Planet',
        },
      ]

      mockSelect.where.mockResolvedValueOnce(mockItems)

      const result = await controller.getInventory(mockRequest)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: 1,
        commodityTicker: 'H2O',
        quantity: 1000,
        locationId: 'BEN',
        lastSyncedAt: '2024-01-01T00:00:00.000Z',
        commodityName: 'Water',
        commodityCategory: 'consumables',
        locationName: 'Benton Station',
        locationType: 'Station',
      })
      expect(db.select).toHaveBeenCalled()
    })

    it('should return empty array when user has no inventory', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const result = await controller.getInventory(mockRequest)

      expect(result).toEqual([])
    })
  })

  describe('syncInventory', () => {
    it('should sync inventory when FIO credentials are configured', async () => {
      const mockSettings = {
        fioUsername: 'fiouser',
        fioApiKey: 'fio-api-key-123',
      }

      mockSelect.where.mockResolvedValueOnce([mockSettings])

      vi.mocked(syncUserInventoryModule.syncUserInventory).mockResolvedValueOnce({
        success: true,
        inserted: 50,
        updated: 0,
        errors: [],
        skippedUnknownLocations: 2,
        skippedUnknownCommodities: 1,
      })

      const result = await controller.syncInventory(mockRequest)

      expect(result).toEqual({
        success: true,
        inserted: 50,
        errors: [],
        skippedUnknownLocations: 2,
        skippedUnknownCommodities: 1,
      })
      expect(syncUserInventoryModule.syncUserInventory).toHaveBeenCalledWith(
        1,
        'fio-api-key-123',
        'fiouser'
      )
    })

    it('should throw error when FIO username is not configured', async () => {
      mockSelect.where.mockResolvedValueOnce([{
        fioUsername: null,
        fioApiKey: 'some-key',
      }])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.syncInventory(mockRequest)).rejects.toThrow(
        'FIO credentials not configured'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(400)
      expect(syncUserInventoryModule.syncUserInventory).not.toHaveBeenCalled()
    })

    it('should throw error when FIO API key is not configured', async () => {
      mockSelect.where.mockResolvedValueOnce([{
        fioUsername: 'fiouser',
        fioApiKey: null,
      }])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.syncInventory(mockRequest)).rejects.toThrow(
        'FIO credentials not configured'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should throw error when no settings exist for user', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.syncInventory(mockRequest)).rejects.toThrow(
        'FIO credentials not configured'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should return sync errors when some items fail', async () => {
      mockSelect.where.mockResolvedValueOnce([{
        fioUsername: 'fiouser',
        fioApiKey: 'fio-api-key',
      }])

      vi.mocked(syncUserInventoryModule.syncUserInventory).mockResolvedValueOnce({
        success: false,
        inserted: 45,
        updated: 0,
        errors: ['Failed to sync item X', 'Failed to sync item Y'],
        skippedUnknownLocations: 0,
        skippedUnknownCommodities: 0,
      })

      const result = await controller.syncInventory(mockRequest)

      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(2)
    })
  })

  describe('getLastSyncTime', () => {
    it('should return last sync time when inventory exists', async () => {
      const syncDate = new Date('2024-01-15T10:30:00Z')
      mockSelect.limit.mockResolvedValueOnce([{ lastSyncedAt: syncDate }])

      const result = await controller.getLastSyncTime(mockRequest)

      expect(result).toEqual({
        lastSyncedAt: '2024-01-15T10:30:00.000Z',
      })
    })

    it('should return null when no inventory exists', async () => {
      mockSelect.limit.mockResolvedValueOnce([])

      const result = await controller.getLastSyncTime(mockRequest)

      expect(result).toEqual({
        lastSyncedAt: null,
      })
    })
  })
})
