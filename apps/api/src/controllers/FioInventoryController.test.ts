import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FioInventoryController } from './FioInventoryController.js'
import { db } from '../db/index.js'
import * as syncUserInventoryModule from '../services/fio/sync-user-inventory.js'
import * as userSettingsService from '../services/userSettingsService.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
  },
  fioInventory: {
    id: 'id',
    userStorageId: 'userStorageId',
    commodityTicker: 'commodityTicker',
    quantity: 'quantity',
  },
  fioUserStorage: {
    id: 'id',
    userId: 'userId',
    storageId: 'storageId',
    locationId: 'locationId',
    type: 'type',
    fioUploadedAt: 'fioUploadedAt',
    lastSyncedAt: 'lastSyncedAt',
  },
  fioCommodities: {
    ticker: 'ticker',
    name: 'name',
    categoryName: 'categoryName',
  },
  fioLocations: {
    naturalId: 'naturalId',
    name: 'name',
    type: 'type',
  },
}))

vi.mock('../services/fio/sync-user-inventory.js', () => ({
  syncUserInventory: vi.fn(),
}))

vi.mock('../services/userSettingsService.js', () => ({
  getSetting: vi.fn(),
  getFioCredentials: vi.fn(),
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
          // Storage fields
          storageType: 'STORE',
          lastSyncedAt: new Date('2024-01-01T00:00:00Z'),
          fioUploadedAt: new Date('2024-01-01T00:00:00Z'),
          // Location fields
          locationId: 'BEN',
          locationName: 'Benton Station',
          locationType: 'Station',
          // Commodity fields
          commodityName: 'Water',
          commodityCategory: 'consumables',
        },
        {
          id: 2,
          commodityTicker: 'RAT',
          quantity: 500,
          storageType: 'STORE',
          lastSyncedAt: new Date('2024-01-01T00:00:00Z'),
          fioUploadedAt: new Date('2024-01-01T00:00:00Z'),
          locationId: 'UV-351a',
          locationName: 'Katoa',
          locationType: 'Planet',
          commodityName: 'Rations',
          commodityCategory: 'consumables',
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
        storageType: 'STORE',
        fioUploadedAt: '2024-01-01T00:00:00.000Z',
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
      // Mock FIO credentials from userSettingsService
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValueOnce({
        fioUsername: 'fiouser',
        fioApiKey: 'fio-api-key-123',
      })

      // Mock excluded locations from userSettingsService
      vi.mocked(userSettingsService.getSetting).mockResolvedValueOnce(['UV-351a'])

      vi.mocked(syncUserInventoryModule.syncUserInventory).mockResolvedValueOnce({
        success: true,
        inserted: 50,
        updated: 0,
        errors: [],
        storageLocations: 3,
        skippedUnknownLocations: 2,
        skippedUnknownCommodities: 1,
        skippedExcludedLocations: 5,
        fioLastSync: '2024-01-01T12:00:00.000Z',
      })

      const result = await controller.syncInventory(mockRequest)

      expect(result).toEqual({
        success: true,
        inserted: 50,
        storageLocations: 3,
        errors: [],
        skippedUnknownLocations: 2,
        skippedUnknownCommodities: 1,
        skippedExcludedLocations: 5,
        fioLastSync: '2024-01-01T12:00:00.000Z',
      })
      expect(syncUserInventoryModule.syncUserInventory).toHaveBeenCalledWith(
        1,
        'fio-api-key-123',
        'fiouser',
        { excludedLocations: ['UV-351a'] }
      )
    })

    it('should throw error when FIO username is not configured', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValueOnce({
        fioUsername: null,
        fioApiKey: 'some-key',
      })

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.syncInventory(mockRequest)).rejects.toThrow(
        'FIO credentials not configured'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(400)
      expect(syncUserInventoryModule.syncUserInventory).not.toHaveBeenCalled()
    })

    it('should throw error when FIO API key is not configured', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValueOnce({
        fioUsername: 'fiouser',
        fioApiKey: null,
      })

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.syncInventory(mockRequest)).rejects.toThrow(
        'FIO credentials not configured'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should throw error when no FIO credentials exist for user', async () => {
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValueOnce({
        fioUsername: null,
        fioApiKey: null,
      })

      const setStatusSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.syncInventory(mockRequest)).rejects.toThrow(
        'FIO credentials not configured'
      )
      expect(setStatusSpy).toHaveBeenCalledWith(400)
    })

    it('should return sync errors when some items fail', async () => {
      // Mock FIO credentials from userSettingsService
      vi.mocked(userSettingsService.getFioCredentials).mockResolvedValueOnce({
        fioUsername: 'fiouser',
        fioApiKey: 'fio-api-key',
      })

      // Mock excluded locations from userSettingsService (empty array)
      vi.mocked(userSettingsService.getSetting).mockResolvedValueOnce([])

      vi.mocked(syncUserInventoryModule.syncUserInventory).mockResolvedValueOnce({
        success: false,
        inserted: 45,
        updated: 0,
        errors: ['Failed to sync item X', 'Failed to sync item Y'],
        storageLocations: 2,
        skippedUnknownLocations: 0,
        skippedUnknownCommodities: 0,
        skippedExcludedLocations: 0,
        fioLastSync: null,
      })

      const result = await controller.syncInventory(mockRequest)

      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(2)
    })
  })

  describe('getLastSyncTime', () => {
    it('should return last sync time when storage exists', async () => {
      const syncDate = new Date('2024-01-15T10:30:00Z')
      const fioDate = new Date('2024-01-15T09:00:00Z')
      mockSelect.limit.mockResolvedValueOnce([
        {
          lastSyncedAt: syncDate,
          fioUploadedAt: fioDate,
        },
      ])

      const result = await controller.getLastSyncTime(mockRequest)

      expect(result).toEqual({
        lastSyncedAt: '2024-01-15T10:30:00.000Z',
        fioUploadedAt: '2024-01-15T09:00:00.000Z',
      })
    })

    it('should return null when no storage exists', async () => {
      mockSelect.limit.mockResolvedValueOnce([])

      const result = await controller.getLastSyncTime(mockRequest)

      expect(result).toEqual({
        lastSyncedAt: null,
        fioUploadedAt: null,
      })
    })
  })

  describe('getStorageLocations', () => {
    let mockSelectDistinct: any

    beforeEach(() => {
      mockSelectDistinct = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      }
      vi.mocked(db.selectDistinct).mockReturnValue(mockSelectDistinct)
    })

    it('should return unique location IDs where user has inventory', async () => {
      mockSelectDistinct.where.mockResolvedValueOnce([
        { locationId: 'BEN' },
        { locationId: 'UV-351a' },
        { locationId: 'MON' },
      ])

      const result = await controller.getStorageLocations(mockRequest)

      expect(result).toEqual({
        locationIds: ['BEN', 'UV-351a', 'MON'],
      })
      expect(db.selectDistinct).toHaveBeenCalled()
    })

    it('should filter out null location IDs', async () => {
      mockSelectDistinct.where.mockResolvedValueOnce([
        { locationId: 'BEN' },
        { locationId: null },
        { locationId: 'MON' },
      ])

      const result = await controller.getStorageLocations(mockRequest)

      expect(result).toEqual({
        locationIds: ['BEN', 'MON'],
      })
    })

    it('should return empty array when user has no storage', async () => {
      mockSelectDistinct.where.mockResolvedValueOnce([])

      const result = await controller.getStorageLocations(mockRequest)

      expect(result).toEqual({
        locationIds: [],
      })
    })
  })
})
