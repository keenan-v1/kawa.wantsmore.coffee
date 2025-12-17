import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FioInventoryController } from './FioInventoryController.js'
import { db } from '../db/index.js'
import * as syncUserInventoryModule from '../services/fio/sync-user-inventory.js'
import * as syncUserDataModule from '../services/fio/sync-user-data.js'
import * as syncContractsModule from '../services/fio/sync-contracts.js'
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

vi.mock('../services/fio/sync-user-data.js', () => ({
  syncFioUserData: vi.fn(),
}))

vi.mock('../services/fio/sync-contracts.js', () => ({
  syncUserContracts: vi.fn(),
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
          locationName: 'Benten Station',
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
        locationName: 'Benten Station',
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

      // Mock user data sync
      vi.mocked(syncUserDataModule.syncFioUserData).mockResolvedValueOnce({
        success: true,
        inserted: 1,
        updated: 0,
        errors: [],
        companyCode: 'CAFS',
        corporationCode: 'KAWA',
        fioTimestamp: '2024-01-01T12:00:00.000Z',
      })

      // Mock inventory sync
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

      // Mock contracts sync
      vi.mocked(syncContractsModule.syncUserContracts).mockResolvedValueOnce({
        success: true,
        inserted: 5,
        updated: 0,
        errors: [],
        contractsProcessed: 5,
        conditionsProcessed: 10,
        reservationsCreated: 2,
        reservationsUpdated: 0,
        skippedNoMatch: 3,
        skippedExternalPartner: 5,
        skippedAlreadyLinked: 0,
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
        userData: {
          success: true,
          companyCode: 'CAFS',
          corporationCode: 'KAWA',
        },
        contracts: {
          success: true,
          contractsProcessed: 5,
          reservationsCreated: 2,
          skippedNoMatch: 3,
          skippedExternalPartner: 5,
        },
      })
      expect(syncUserDataModule.syncFioUserData).toHaveBeenCalledWith(
        1,
        'fio-api-key-123',
        'fiouser'
      )
      expect(syncUserInventoryModule.syncUserInventory).toHaveBeenCalledWith(
        1,
        'fio-api-key-123',
        'fiouser',
        { excludedLocations: ['UV-351a'] }
      )
      expect(syncContractsModule.syncUserContracts).toHaveBeenCalledWith(1, 'fio-api-key-123')
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

      // Mock user data sync (success)
      vi.mocked(syncUserDataModule.syncFioUserData).mockResolvedValueOnce({
        success: true,
        inserted: 0,
        updated: 1,
        errors: [],
        companyCode: 'CAFS',
        corporationCode: 'KAWA',
        fioTimestamp: '2024-01-01T12:00:00.000Z',
      })

      // Mock inventory sync (failure)
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

      // Mock contracts sync (success)
      vi.mocked(syncContractsModule.syncUserContracts).mockResolvedValueOnce({
        success: true,
        inserted: 0,
        updated: 0,
        errors: [],
        contractsProcessed: 0,
        conditionsProcessed: 0,
        reservationsCreated: 0,
        reservationsUpdated: 0,
        skippedNoMatch: 0,
        skippedExternalPartner: 0,
        skippedAlreadyLinked: 0,
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

  describe('getStats', () => {
    it('should return FIO inventory statistics', async () => {
      // Mock storage stats query
      const mockStorageStats = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValueOnce([
          {
            storageCount: 3,
            newestSync: new Date('2024-01-15T12:00:00Z'),
            oldestFioUpload: new Date('2024-01-10T08:00:00Z'),
            newestFioUpload: new Date('2024-01-15T10:00:00Z'),
          },
        ]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockStorageStats as any)

      // Mock oldest location query
      const mockOldestLocation = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([
          {
            storageType: 'STORE',
            locationNaturalId: 'UV-351a',
            fioUploadedAt: new Date('2024-01-10T08:00:00Z'),
          },
        ]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockOldestLocation as any)

      // Mock inventory stats query
      const mockInventoryStats = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValueOnce([
          { totalQuantity: 1000, ticker: 'H2O' },
          { totalQuantity: 500, ticker: 'RAT' },
          { totalQuantity: 200, ticker: 'H2O' },
        ]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockInventoryStats as any)

      const result = await controller.getStats(mockRequest)

      expect(result).toEqual({
        totalItems: 3,
        totalQuantity: 1700,
        uniqueCommodities: 2,
        storageLocations: 3,
        newestSyncTime: '2024-01-15T12:00:00.000Z',
        oldestFioUploadTime: '2024-01-10T08:00:00.000Z',
        oldestFioUploadLocation: {
          storageType: 'STORE',
          locationNaturalId: 'UV-351a',
        },
        newestFioUploadTime: '2024-01-15T10:00:00.000Z',
      })
    })

    it('should return null values when no data exists', async () => {
      // Mock storage stats query (empty)
      const mockStorageStats = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValueOnce([
          {
            storageCount: 0,
            newestSync: null,
            oldestFioUpload: null,
            newestFioUpload: null,
          },
        ]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockStorageStats as any)

      // Mock oldest location query (empty)
      const mockOldestLocation = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValueOnce([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockOldestLocation as any)

      // Mock inventory stats query (empty)
      const mockInventoryStats = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValueOnce([]),
      }
      vi.mocked(db.select).mockReturnValueOnce(mockInventoryStats as any)

      const result = await controller.getStats(mockRequest)

      expect(result).toEqual({
        totalItems: 0,
        totalQuantity: 0,
        uniqueCommodities: 0,
        storageLocations: 0,
        newestSyncTime: null,
        oldestFioUploadTime: null,
        oldestFioUploadLocation: null,
        newestFioUploadTime: null,
      })
    })
  })

  describe('clearInventory', () => {
    let mockDelete: any

    beforeEach(() => {
      mockDelete = {
        where: vi.fn().mockResolvedValue(undefined),
      }
      vi.mocked(db.delete).mockReturnValue(mockDelete)
    })

    it('should clear all user inventory and storage', async () => {
      // Mock getting storage IDs
      mockSelect.where.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }])

      // Mock count for each storage before deletion
      const mockCountSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 10 }]),
      }
      vi.mocked(db.select)
        .mockReturnValueOnce(mockSelect) // storage IDs
        .mockReturnValueOnce(mockCountSelect as any) // count for storage 1
        .mockReturnValueOnce(mockCountSelect as any) // count for storage 2
        .mockReturnValueOnce(mockCountSelect as any) // count for storage 3

      const result = await controller.clearInventory(mockRequest)

      expect(result).toEqual({
        success: true,
        deletedItems: 30, // 10 items per storage
        deletedStorages: 3,
      })
      expect(db.delete).toHaveBeenCalled()
    })

    it('should return zeros when user has no storage', async () => {
      mockSelect.where.mockResolvedValueOnce([])

      const result = await controller.clearInventory(mockRequest)

      expect(result).toEqual({
        success: true,
        deletedItems: 0,
        deletedStorages: 0,
      })
    })
  })
})
