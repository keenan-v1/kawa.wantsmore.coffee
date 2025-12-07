import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportConfigsController, GoogleSheetsImportController } from './ImportConfigsController.js'
import { db } from '../db/index.js'
import type { AuthenticatedRequest } from '../middleware/auth.js'
import * as googleSheetsClient from '../services/google-sheets/client.js'
import * as importService from '../services/csv/import.js'

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  priceImportConfigs: {
    id: 'id',
    name: 'name',
    type: 'type',
    exchangeCode: 'exchange_code',
    url: 'url',
    sheetGid: 'sheet_gid',
    fieldMapping: 'field_mapping',
    locationDefault: 'location_default',
    currencyDefault: 'currency_default',
    autoSync: 'auto_sync',
    syncIntervalHours: 'sync_interval_hours',
    lastSyncedAt: 'last_synced_at',
    lastSyncResult: 'last_sync_result',
    createdByUserId: 'created_by_user_id',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  fioExchanges: { code: 'code' },
  fioLocations: { naturalId: 'natural_id' },
  users: { id: 'id', username: 'username' },
}))

vi.mock('../services/google-sheets/client.js', () => ({
  parseGoogleSheetsUrl: vi.fn(),
  fetchSheetAsCsv: vi.fn(),
  fetchSheetByUrl: vi.fn(),
}))

vi.mock('../services/csv/import.js', () => ({
  importCsvPrices: vi.fn(),
  previewCsvImport: vi.fn(),
}))

describe('ImportConfigsController', () => {
  let controller: ImportConfigsController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new ImportConfigsController()
  })

  describe('getConfigs', () => {
    it('should return all import configurations', async () => {
      const mockConfigs = [
        {
          id: 1,
          name: 'KAWA Prices',
          type: 'google_sheets',
          exchangeCode: 'KAWA',
          url: 'https://docs.google.com/spreadsheets/d/123/edit',
          sheetGid: null,
          fieldMapping: { ticker: 0, price: 1 },
          locationDefault: 'BEN',
          currencyDefault: 'CIS',
          autoSync: false,
          syncIntervalHours: 24,
          lastSyncedAt: null,
          lastSyncResult: null,
          createdByUserId: 1,
          createdByUsername: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const mockFrom = vi.fn().mockReturnThis()
      const mockLeftJoin = vi.fn().mockReturnThis()
      const mockOrderBy = vi.fn().mockResolvedValue(mockConfigs)

      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any)
      mockFrom.mockReturnValue({
        leftJoin: mockLeftJoin,
      } as any)
      mockLeftJoin.mockReturnValue({
        orderBy: mockOrderBy,
      } as any)

      const result = await controller.getConfigs()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('KAWA Prices')
      expect(result[0].type).toBe('google_sheets')
    })
  })

  describe('getConfig', () => {
    it('should return a specific configuration', async () => {
      const mockConfig = {
        id: 1,
        name: 'KAWA Prices',
        type: 'google_sheets',
        exchangeCode: 'KAWA',
        url: 'https://docs.google.com/spreadsheets/d/123/edit',
        sheetGid: null,
        fieldMapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
        autoSync: false,
        syncIntervalHours: 24,
        lastSyncedAt: null,
        lastSyncResult: null,
        createdByUserId: 1,
        createdByUsername: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const mockFrom = vi.fn().mockReturnThis()
      const mockLeftJoin = vi.fn().mockReturnThis()
      const mockWhere = vi.fn().mockReturnThis()
      const mockLimit = vi.fn().mockResolvedValue([mockConfig])

      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any)
      mockFrom.mockReturnValue({
        leftJoin: mockLeftJoin,
      } as any)
      mockLeftJoin.mockReturnValue({
        where: mockWhere,
      } as any)
      mockWhere.mockReturnValue({
        limit: mockLimit,
      } as any)

      const result = await controller.getConfig(1)

      expect(result.id).toBe(1)
      expect(result.name).toBe('KAWA Prices')
    })

    it('should throw NotFound for non-existent configuration', async () => {
      const mockFrom = vi.fn().mockReturnThis()
      const mockLeftJoin = vi.fn().mockReturnThis()
      const mockWhere = vi.fn().mockReturnThis()
      const mockLimit = vi.fn().mockResolvedValue([])

      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any)
      mockFrom.mockReturnValue({
        leftJoin: mockLeftJoin,
      } as any)
      mockLeftJoin.mockReturnValue({
        where: mockWhere,
      } as any)
      mockWhere.mockReturnValue({
        limit: mockLimit,
      } as any)

      await expect(controller.getConfig(999)).rejects.toThrow('not found')
    })
  })

  describe('createConfig', () => {
    it('should create a new configuration', async () => {
      const mockRequest = { user: { userId: 1 } } as AuthenticatedRequest

      vi.mocked(googleSheetsClient.parseGoogleSheetsUrl).mockReturnValue({
        spreadsheetId: '123',
        sheetGid: undefined,
      })

      // Mock exchange exists check
      const mockExchangeFrom = vi.fn().mockReturnThis()
      const mockExchangeWhere = vi.fn().mockReturnThis()
      const mockExchangeLimit = vi.fn().mockResolvedValue([{ code: 'KAWA' }])

      // Mock insert
      const mockInsertValues = vi.fn().mockReturnThis()
      const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 1 }])

      // Mock get after insert
      const mockGetFrom = vi.fn().mockReturnThis()
      const mockGetLeftJoin = vi.fn().mockReturnThis()
      const mockGetWhere = vi.fn().mockReturnThis()
      const mockGetLimit = vi.fn().mockResolvedValue([
        {
          id: 1,
          name: 'KAWA Prices',
          type: 'google_sheets',
          exchangeCode: 'KAWA',
          url: 'https://docs.google.com/spreadsheets/d/123/edit',
          sheetGid: null,
          fieldMapping: { ticker: 0, price: 1 },
          locationDefault: null,
          currencyDefault: null,
          autoSync: false,
          syncIntervalHours: 24,
          lastSyncedAt: null,
          lastSyncResult: null,
          createdByUserId: 1,
          createdByUsername: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      let selectCallCount = 0
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 1) {
          // Exchange check
          return {
            from: mockExchangeFrom,
          } as any
        }
        // Get after insert
        return {
          from: mockGetFrom,
        } as any
      })

      mockExchangeFrom.mockReturnValue({ where: mockExchangeWhere } as any)
      mockExchangeWhere.mockReturnValue({ limit: mockExchangeLimit } as any)

      vi.mocked(db.insert).mockReturnValue({
        values: mockInsertValues,
      } as any)
      mockInsertValues.mockReturnValue({
        returning: mockInsertReturning,
      } as any)

      mockGetFrom.mockReturnValue({ leftJoin: mockGetLeftJoin } as any)
      mockGetLeftJoin.mockReturnValue({ where: mockGetWhere } as any)
      mockGetWhere.mockReturnValue({ limit: mockGetLimit } as any)

      const result = await controller.createConfig(mockRequest, {
        name: 'KAWA Prices',
        type: 'google_sheets',
        exchangeCode: 'KAWA',
        url: 'https://docs.google.com/spreadsheets/d/123/edit',
        fieldMapping: { ticker: 0, price: 1 },
      })

      expect(result.id).toBe(1)
      expect(result.name).toBe('KAWA Prices')
    })

    it('should throw BadRequest for invalid Google Sheets URL', async () => {
      const mockRequest = { user: { userId: 1 } } as AuthenticatedRequest

      vi.mocked(googleSheetsClient.parseGoogleSheetsUrl).mockReturnValue(null)

      await expect(
        controller.createConfig(mockRequest, {
          name: 'Invalid',
          type: 'google_sheets',
          exchangeCode: 'KAWA',
          url: 'not-a-valid-url',
          fieldMapping: { ticker: 0, price: 1 },
        })
      ).rejects.toThrow('Invalid Google Sheets URL')
    })

    it('should throw BadRequest for invalid field mapping', async () => {
      const mockRequest = { user: { userId: 1 } } as AuthenticatedRequest

      vi.mocked(googleSheetsClient.parseGoogleSheetsUrl).mockReturnValue({
        spreadsheetId: '123',
      })

      // Mock exchange check
      const mockFrom = vi.fn().mockReturnThis()
      const mockWhere = vi.fn().mockReturnThis()
      const mockLimit = vi.fn().mockResolvedValue([{ code: 'KAWA' }])

      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any)
      mockFrom.mockReturnValue({ where: mockWhere } as any)
      mockWhere.mockReturnValue({ limit: mockLimit } as any)

      await expect(
        controller.createConfig(mockRequest, {
          name: 'Invalid Mapping',
          type: 'google_sheets',
          exchangeCode: 'KAWA',
          url: 'https://docs.google.com/spreadsheets/d/123/edit',
          fieldMapping: { ticker: '', price: 1 } as any, // Invalid - empty ticker
        })
      ).rejects.toThrow('fieldMapping must include ticker and price fields')
    })
  })

  describe('deleteConfig', () => {
    it('should delete a configuration', async () => {
      // Mock exists check
      const mockFrom = vi.fn().mockReturnThis()
      const mockWhere = vi.fn().mockReturnThis()
      const mockLimit = vi.fn().mockResolvedValue([{ id: 1 }])

      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any)
      mockFrom.mockReturnValue({ where: mockWhere } as any)
      mockWhere.mockReturnValue({ limit: mockLimit } as any)

      // Mock delete
      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
      vi.mocked(db.delete).mockReturnValue({
        where: mockDeleteWhere,
      } as any)

      await controller.deleteConfig(1)

      expect(db.delete).toHaveBeenCalled()
    })

    it('should throw NotFound for non-existent configuration', async () => {
      const mockFrom = vi.fn().mockReturnThis()
      const mockWhere = vi.fn().mockReturnThis()
      const mockLimit = vi.fn().mockResolvedValue([])

      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any)
      mockFrom.mockReturnValue({ where: mockWhere } as any)
      mockWhere.mockReturnValue({ limit: mockLimit } as any)

      await expect(controller.deleteConfig(999)).rejects.toThrow('not found')
    })
  })

  describe('syncConfig', () => {
    it('should sync from Google Sheets successfully', async () => {
      // Mock getConfig
      const mockConfig = {
        id: 1,
        name: 'KAWA Prices',
        type: 'google_sheets' as const,
        exchangeCode: 'KAWA',
        url: 'https://docs.google.com/spreadsheets/d/123/edit#gid=456',
        sheetGid: 456,
        fieldMapping: { ticker: 0, price: 1 },
        locationDefault: null,
        currencyDefault: null,
        autoSync: false,
        syncIntervalHours: 24,
        lastSyncedAt: null,
        lastSyncResult: null,
        createdByUserId: 1,
        createdByUsername: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const mockFrom = vi.fn().mockReturnThis()
      const mockLeftJoin = vi.fn().mockReturnThis()
      const mockWhere = vi.fn().mockReturnThis()
      const mockLimit = vi.fn().mockResolvedValue([mockConfig])

      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any)
      mockFrom.mockReturnValue({ leftJoin: mockLeftJoin } as any)
      mockLeftJoin.mockReturnValue({ where: mockWhere } as any)
      mockWhere.mockReturnValue({ limit: mockLimit } as any)

      vi.mocked(googleSheetsClient.parseGoogleSheetsUrl).mockReturnValue({
        spreadsheetId: '123',
        sheetGid: 456,
      })

      vi.mocked(googleSheetsClient.fetchSheetAsCsv).mockResolvedValue({
        success: true,
        content: 'Ticker,Price\nH2O,100',
      })

      const mockImportResult = {
        imported: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      }
      vi.mocked(importService.importCsvPrices).mockResolvedValue(mockImportResult)

      // Mock update
      const mockUpdateSet = vi.fn().mockReturnThis()
      const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
      vi.mocked(db.update).mockReturnValue({
        set: mockUpdateSet,
      } as any)
      mockUpdateSet.mockReturnValue({ where: mockUpdateWhere } as any)

      const result = await controller.syncConfig(1)

      expect(result.imported).toBe(1)
      expect(googleSheetsClient.fetchSheetAsCsv).toHaveBeenCalledWith('123', 456)
      expect(importService.importCsvPrices).toHaveBeenCalled()
      expect(db.update).toHaveBeenCalled()
    })
  })
})

describe('GoogleSheetsImportController', () => {
  let controller: GoogleSheetsImportController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new GoogleSheetsImportController()
  })

  describe('importFromGoogleSheets', () => {
    it('should import from Google Sheets', async () => {
      vi.mocked(googleSheetsClient.parseGoogleSheetsUrl).mockReturnValue({
        spreadsheetId: '123',
        sheetGid: 456,
      })

      // Mock exchange check
      const mockFrom = vi.fn().mockReturnThis()
      const mockWhere = vi.fn().mockReturnThis()
      const mockLimit = vi.fn().mockResolvedValue([{ code: 'KAWA' }])

      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any)
      mockFrom.mockReturnValue({ where: mockWhere } as any)
      mockWhere.mockReturnValue({ limit: mockLimit } as any)

      vi.mocked(googleSheetsClient.fetchSheetAsCsv).mockResolvedValue({
        success: true,
        content: 'Ticker,Price\nH2O,100',
      })

      const mockImportResult = {
        imported: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      }
      vi.mocked(importService.importCsvPrices).mockResolvedValue(mockImportResult)

      const result = await controller.importFromGoogleSheets({
        url: 'https://docs.google.com/spreadsheets/d/123/edit#gid=456',
        exchangeCode: 'KAWA',
        fieldMapping: { ticker: 0, price: 1 },
      })

      expect(result.imported).toBe(1)
    })

    it('should throw BadRequest for invalid URL', async () => {
      vi.mocked(googleSheetsClient.parseGoogleSheetsUrl).mockReturnValue(null)

      await expect(
        controller.importFromGoogleSheets({
          url: 'not-a-valid-url',
          exchangeCode: 'KAWA',
          fieldMapping: { ticker: 0, price: 1 },
        })
      ).rejects.toThrow('Invalid Google Sheets URL')
    })

    it('should throw BadRequest for fetch failure', async () => {
      vi.mocked(googleSheetsClient.parseGoogleSheetsUrl).mockReturnValue({
        spreadsheetId: '123',
      })

      // Mock exchange check
      const mockFrom = vi.fn().mockReturnThis()
      const mockWhere = vi.fn().mockReturnThis()
      const mockLimit = vi.fn().mockResolvedValue([{ code: 'KAWA' }])

      vi.mocked(db.select).mockReturnValue({
        from: mockFrom,
      } as any)
      mockFrom.mockReturnValue({ where: mockWhere } as any)
      mockWhere.mockReturnValue({ limit: mockLimit } as any)

      vi.mocked(googleSheetsClient.fetchSheetAsCsv).mockResolvedValue({
        success: false,
        error: 'Sheet not accessible',
      })

      await expect(
        controller.importFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/123/edit',
          exchangeCode: 'KAWA',
          fieldMapping: { ticker: 0, price: 1 },
        })
      ).rejects.toThrow('Sheet not accessible')
    })
  })

  describe('previewGoogleSheetsImport', () => {
    it('should preview import from Google Sheets', async () => {
      vi.mocked(googleSheetsClient.fetchSheetByUrl).mockResolvedValue({
        success: true,
        content: 'Ticker,Price\nH2O,100',
      })

      const mockPreviewResult = {
        headers: ['Ticker', 'Price'],
        sampleRows: [],
        parseErrors: [],
        validationErrors: [],
        delimiter: ',',
        totalRows: 1,
        validRows: 1,
      }
      vi.mocked(importService.previewCsvImport).mockResolvedValue(mockPreviewResult)

      const result = await controller.previewGoogleSheetsImport({
        url: 'https://docs.google.com/spreadsheets/d/123/edit',
        exchangeCode: 'KAWA',
        fieldMapping: { ticker: 0, price: 1 },
      })

      expect(result.totalRows).toBe(1)
      expect(googleSheetsClient.fetchSheetByUrl).toHaveBeenCalled()
    })
  })
})
