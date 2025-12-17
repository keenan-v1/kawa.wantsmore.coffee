import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportConfigsController, GoogleSheetsImportController } from './ImportConfigsController.js'

// Mock result holders
let mockImportConfigsResult: unknown[] = []
let mockPriceListsResult: unknown[] = []
let mockLocationsResult: unknown[] = []
let mockCommoditiesResult: unknown[] = []
let mockPricesResult: unknown[] = []
let mockInsertedId = 1

// Track insert/update calls
let insertCalls: unknown[] = []
let updateCalls: unknown[] = []

vi.mock('../db/index.js', () => {
  const importConfigsTable = { __table: 'importConfigs' }
  const priceListsTable = { __table: 'priceLists' }
  const fioLocationsTable = { __table: 'fioLocations' }
  const fioCommoditiesTable = { __table: 'fioCommodities' }
  const pricesTable = { __table: 'prices' }

  return {
    db: {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: { __table: string }) => {
          const tableName = table?.__table || ''

          if (tableName === 'importConfigs') {
            return {
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockImportConfigsResult)),
              })),
              orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockImportConfigsResult)),
            }
          }
          if (tableName === 'priceLists') {
            return {
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockPriceListsResult)),
              })),
            }
          }
          if (tableName === 'fioLocations') {
            return Promise.resolve(mockLocationsResult)
          }
          if (tableName === 'fioCommodities') {
            return Promise.resolve(mockCommoditiesResult)
          }
          if (tableName === 'prices') {
            return {
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockPricesResult)),
              })),
            }
          }
          return {
            where: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockResolvedValue([]),
          }
        }),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((data: unknown) => {
          insertCalls.push(data)
          return {
            returning: vi
              .fn()
              .mockImplementation(() => Promise.resolve([{ id: mockInsertedId++ }])),
          }
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((data: unknown) => {
          updateCalls.push(data)
          return {
            where: vi.fn().mockResolvedValue(undefined),
          }
        }),
      })),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    },
    importConfigs: importConfigsTable,
    priceLists: priceListsTable,
    fioLocations: fioLocationsTable,
    fioCommodities: fioCommoditiesTable,
    prices: pricesTable,
  }
})

// Mock Google Sheets client
let mockSheetContent = ''
vi.mock('../services/google-sheets/client.js', () => ({
  parseGoogleSheetsUrl: vi.fn().mockImplementation((url: string) => {
    if (url.includes('invalid')) return null
    return { spreadsheetId: 'test-id', sheetGid: 0 }
  }),
  fetchSheetAsCsv: vi.fn().mockImplementation(() => {
    if (mockSheetContent === 'ERROR') {
      return Promise.resolve({ success: false, error: 'Failed to fetch' })
    }
    return Promise.resolve({ success: true, content: mockSheetContent })
  }),
  fetchSheetByUrl: vi.fn().mockImplementation(() => {
    if (mockSheetContent === 'ERROR') {
      return Promise.resolve({ success: false, error: 'Failed to fetch' })
    }
    return Promise.resolve({ success: true, content: mockSheetContent })
  }),
}))

// Mock CSV import
vi.mock('../services/csv/import.js', () => ({
  importCsvPrices: vi.fn().mockResolvedValue({
    imported: 1,
    updated: 0,
    skipped: 0,
    errors: [],
  }),
  previewCsvImport: vi.fn().mockResolvedValue({
    rows: [],
    errors: [],
    validRows: 1,
    invalidRows: 0,
  }),
}))

describe('ImportConfigsController', () => {
  let controller: ImportConfigsController

  beforeEach(() => {
    controller = new ImportConfigsController()
    controller.setStatus = vi.fn()
    vi.clearAllMocks()

    // Reset mocks
    mockImportConfigsResult = []
    mockPriceListsResult = []
    mockLocationsResult = []
    mockCommoditiesResult = []
    mockPricesResult = []
    mockSheetContent = ''
    mockInsertedId = 1
    insertCalls = []
    updateCalls = []
  })

  describe('getConfig', () => {
    it('should return a specific import configuration', async () => {
      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test Config',
          sourceType: 'google_sheets',
          format: 'flat',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: 0,
          config: { fieldMapping: { ticker: 'Ticker', price: 'Price' } },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.getConfig(1)

      expect(result.id).toBe(1)
      expect(result.name).toBe('Test Config')
      expect(result.config).toEqual({ fieldMapping: { ticker: 'Ticker', price: 'Price' } })
    })

    it('should throw NotFound for non-existent config', async () => {
      mockImportConfigsResult = []

      await expect(controller.getConfig(999)).rejects.toThrow('Import configuration with ID 999 not found')
    })
  })

  describe('createConfig', () => {
    it('should create a new import configuration', async () => {
      mockPriceListsResult = [{ code: 'KAWA' }]
      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'New Config',
          sourceType: 'csv',
          format: 'flat',
          sheetsUrl: null,
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.createConfig({
        priceListCode: 'kawa',
        name: 'New Config',
        sourceType: 'csv',
        format: 'flat',
      })

      expect(result.priceListCode).toBe('KAWA')
      expect(result.name).toBe('New Config')
      expect(controller.setStatus).toHaveBeenCalledWith(201)
    })

    it('should throw BadRequest for invalid price list', async () => {
      mockPriceListsResult = []

      await expect(
        controller.createConfig({
          priceListCode: 'INVALID',
          name: 'Test',
          sourceType: 'csv',
          format: 'flat',
        })
      ).rejects.toThrow("Price list 'INVALID' not found")
    })

    it('should throw BadRequest for invalid Google Sheets URL', async () => {
      mockPriceListsResult = [{ code: 'KAWA' }]

      await expect(
        controller.createConfig({
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'flat',
          sheetsUrl: 'https://invalid-url.com/sheet',
        })
      ).rejects.toThrow('Invalid Google Sheets URL')
    })

    it('should accept valid Google Sheets URL', async () => {
      mockPriceListsResult = [{ code: 'KAWA' }]
      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Sheet Config',
          sourceType: 'google_sheets',
          format: 'flat',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: 0,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.createConfig({
        priceListCode: 'KAWA',
        name: 'Sheet Config',
        sourceType: 'google_sheets',
        format: 'flat',
        sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
        sheetGid: 0,
      })

      expect(result.sourceType).toBe('google_sheets')
    })
  })

  describe('updateConfig', () => {
    it('should update an existing configuration', async () => {
      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Updated Config',
          sourceType: 'csv',
          format: 'flat',
          sheetsUrl: null,
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.updateConfig(1, {
        name: 'Updated Config',
      })

      expect(result.name).toBe('Updated Config')
    })

    it('should throw NotFound for non-existent config', async () => {
      mockImportConfigsResult = []

      await expect(
        controller.updateConfig(999, { name: 'Test' })
      ).rejects.toThrow('Import configuration with ID 999 not found')
    })

    it('should validate Google Sheets URL when updating', async () => {
      mockImportConfigsResult = [
        {
          id: 1,
          sourceType: 'google_sheets',
        },
      ]

      await expect(
        controller.updateConfig(1, {
          sheetsUrl: 'https://invalid-url.com/sheet',
        })
      ).rejects.toThrow('Invalid Google Sheets URL')
    })
  })

  describe('deleteConfig', () => {
    it('should delete an existing configuration', async () => {
      mockImportConfigsResult = [{ id: 1 }]

      await controller.deleteConfig(1)

      expect(controller.setStatus).toHaveBeenCalledWith(204)
    })

    it('should throw NotFound for non-existent config', async () => {
      mockImportConfigsResult = []

      await expect(controller.deleteConfig(999)).rejects.toThrow(
        'Import configuration with ID 999 not found'
      )
    })
  })

  describe('syncConfig', () => {
    it('should throw BadRequest when Google Sheets URL is missing', async () => {
      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'flat',
          sheetsUrl: null,
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await expect(controller.syncConfig(1)).rejects.toThrow(
        'Google Sheets URL is required for sync'
      )
    })

    it('should throw BadRequest for non-sheets CSV source', async () => {
      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'csv',
          format: 'flat',
          sheetsUrl: null,
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await expect(controller.syncConfig(1)).rejects.toThrow(
        'CSV import not yet implemented for non-sheets sources'
      )
    })
  })

  describe('pivot format', () => {
    beforeEach(() => {
      mockLocationsResult = [
        { naturalId: 'MON', name: 'Montem' },
        { naturalId: 'BEN', name: 'Benten' },
      ]
      mockCommoditiesResult = [{ ticker: 'DW' }, { ticker: 'RAT' }]
      mockPriceListsResult = [{ code: 'KAWA' }]
    })

    it('should sync pivot format', async () => {
      mockSheetContent = `Ticker,Montem,Benten
DW,24,25
RAT,39,40`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Pivot Config',
          sourceType: 'google_sheets',
          format: 'pivot',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockPricesResult = []

      const result = await controller.syncConfig(1)

      expect(result.imported).toBe(4)
      expect(result.errors).toHaveLength(0)
    })

    it('should throw error when no ticker column found', async () => {
      mockSheetContent = `Name,Montem,Benten
DW,24,25`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Pivot Config',
          sourceType: 'google_sheets',
          format: 'pivot',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await expect(controller.syncConfig(1)).rejects.toThrow(
        'Could not find Ticker column'
      )
    })

    it('should throw error when no location columns found', async () => {
      mockSheetContent = `Ticker,Unknown1,Unknown2
DW,24,25`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Pivot Config',
          sourceType: 'google_sheets',
          format: 'pivot',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await expect(controller.syncConfig(1)).rejects.toThrow(
        'No location columns found'
      )
    })

    it('should throw error for insufficient rows', async () => {
      mockSheetContent = `Ticker,Montem`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Pivot Config',
          sourceType: 'google_sheets',
          format: 'pivot',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await expect(controller.syncConfig(1)).rejects.toThrow(
        'Sheet must have at least a header row and one data row'
      )
    })

    it('should preview pivot format without writing', async () => {
      mockSheetContent = `Ticker,Montem,Benten
DW,24,25`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Pivot Config',
          sourceType: 'google_sheets',
          format: 'pivot',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.previewConfig(1) as { imported: number }

      expect(result.imported).toBe(2)
      expect(insertCalls).toHaveLength(0)
    })

    it('should handle unknown tickers in pivot format', async () => {
      mockSheetContent = `Ticker,Montem
UNKNOWN,24
DW,25`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Pivot Config',
          sourceType: 'google_sheets',
          format: 'pivot',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockPricesResult = []

      const result = await controller.syncConfig(1)

      expect(result.imported).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Unknown ticker')
    })

    it('should handle invalid prices in pivot format', async () => {
      mockSheetContent = `Ticker,Montem
DW,invalid`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Pivot Config',
          sourceType: 'google_sheets',
          format: 'pivot',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockPricesResult = []

      const result = await controller.syncConfig(1)

      expect(result.imported).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Invalid price')
    })

    it('should update existing prices in pivot format', async () => {
      mockSheetContent = `Ticker,Montem
DW,30`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Pivot Config',
          sourceType: 'google_sheets',
          format: 'pivot',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockPricesResult = [{ id: 100 }]

      const result = await controller.syncConfig(1)

      expect(result.imported).toBe(0)
      expect(result.updated).toBe(1)
    })

    it('should skip empty and dash prices', async () => {
      mockSheetContent = `Ticker,Montem,Benten
DW,-,
RAT,39,`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Pivot Config',
          sourceType: 'google_sheets',
          format: 'pivot',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockPricesResult = []

      const result = await controller.syncConfig(1)

      expect(result.imported).toBe(1)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('flat format', () => {
    beforeEach(() => {
      mockLocationsResult = [{ naturalId: 'MON', name: 'Montem' }]
      mockCommoditiesResult = [{ ticker: 'DW' }]
      mockPriceListsResult = [{ code: 'KAWA' }]
    })

    it('should sync flat format with field mapping', async () => {
      mockSheetContent = `Ticker,Location,Price
DW,MON,24`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Flat Config',
          sourceType: 'google_sheets',
          format: 'flat',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: {
            fieldMapping: {
              ticker: 'Ticker',
              price: 'Price',
              location: 'Location',
            },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      // The flat format uses importCsvPrices which is mocked
      const result = await controller.syncConfig(1)

      expect(result).toBeDefined()
    })

    it('should preview flat format', async () => {
      mockSheetContent = `Ticker,Location,Price
DW,MON,24`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Flat Config',
          sourceType: 'google_sheets',
          format: 'flat',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.previewConfig(1)

      expect(result).toBeDefined()
    })
  })

  describe('KAWA format parsing', () => {
    // KAWA format: locations are in the commodity's info row, not the header
    // Row 0: date, Row 1: column labels, Row 2+: data pairs (info row with locations, price row)
    // Locations AND prices both start at column D (index 3)
    const sampleKawaCsv = `,,,Updated 2023-Feb-19
Category,Ticker,Material,Proxion
Pioneer Consumables,DW,Drinking Water,Montem,Vallis,Benten
,,, 24, 25, 26
,RAT,Basic Rations,Montem,Vallis,Benten
,,, 39, 40, 41`

    beforeEach(() => {
      // Setup locations
      mockLocationsResult = [
        { naturalId: 'MON', name: 'Montem', systemName: 'Moria' },
        { naturalId: 'VH-331a', name: 'Vallis', systemName: 'Verdant' },
        { naturalId: 'BEN', name: 'Benten', systemName: 'Benten' },
      ]

      // Setup commodities
      mockCommoditiesResult = [{ ticker: 'DW' }, { ticker: 'RAT' }, { ticker: 'OVE' }]

      // Setup price list
      mockPriceListsResult = [{ code: 'KAWA' }]
    })

    it('should parse KAWA format CSV with locations in info rows', async () => {
      mockSheetContent = sampleKawaCsv

      // Setup the import config
      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'KAWA Price Sheet',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      // No existing prices
      mockPricesResult = []

      const result = await controller.syncConfig(1)

      // Should have imported 6 prices (2 commodities × 3 locations)
      expect(result.imported).toBe(6)
      expect(result.updated).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle quoted fields with commas in CSV', async () => {
      mockSheetContent = `,,,Title
Category,Ticker,Material,Proxion
"Category, With Comma",DW,"Drinking, Water",Montem
,,, 24`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockPricesResult = []

      const result = await controller.syncConfig(1)

      expect(result.imported).toBe(1)
      expect(result.errors).toHaveLength(0)
    })

    it('should skip unknown tickers but import valid ones', async () => {
      mockSheetContent = `,,,Title
Category,Ticker,Material,Proxion
Test,UNKNOWN,Unknown Material,Montem
,,, 100
,DW,Drinking Water,Montem
,,, 25`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockPricesResult = []

      const result = await controller.syncConfig(1)

      // Only DW should be imported, UNKNOWN should be skipped
      expect(result.imported).toBe(1)
    })

    it('should skip invalid prices', async () => {
      mockSheetContent = `,,,Title
Category,Ticker,Material,Proxion
Test,DW,Drinking Water,Montem
,,, invalid`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockPricesResult = []

      const result = await controller.syncConfig(1)

      expect(result.imported).toBe(0)
      expect(result.skipped).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Invalid price')
    })

    it('should handle empty price cells gracefully', async () => {
      mockSheetContent = `,,,Title
Category,Ticker,Material,Proxion
Test,DW,Drinking Water,Montem,Vallis
,,, 24,`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]
      mockPricesResult = []

      const result = await controller.syncConfig(1)

      // Only Montem has a price
      expect(result.imported).toBe(1)
    })

    it('should update existing prices', async () => {
      mockSheetContent = `,,,Title
Category,Ticker,Material,Proxion
Test,DW,Drinking Water,Montem
,,, 30`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      // Existing price
      mockPricesResult = [{ id: 100 }]

      const result = await controller.syncConfig(1)

      expect(result.imported).toBe(0)
      expect(result.updated).toBe(1)
    })

    it('should throw error for invalid Google Sheets URL', async () => {
      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://invalid-url.com',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await expect(controller.syncConfig(1)).rejects.toThrow('Invalid Google Sheets URL')
    })

    it('should throw error when sheet fetch fails', async () => {
      mockSheetContent = 'ERROR'

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await expect(controller.syncConfig(1)).rejects.toThrow('Failed to fetch')
    })

    it('should throw error when no valid price data found', async () => {
      mockSheetContent = `,,,Title
Category,Ticker,Material,Proxion
Test,DW,Drinking Water,UnknownPlace
,,, 24`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      await expect(controller.syncConfig(1)).rejects.toThrow('No valid price data found')
    })
  })

  describe('preview KAWA format', () => {
    beforeEach(() => {
      mockLocationsResult = [{ naturalId: 'MON', name: 'Montem', systemName: 'Moria' }]
      mockCommoditiesResult = [{ ticker: 'DW' }]
      mockPriceListsResult = [{ code: 'KAWA' }]
    })

    it('should preview without writing to database', async () => {
      mockSheetContent = `,,,Title
Category,Ticker,Material,Proxion
Test,DW,Drinking Water,Montem
,,, 24`

      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'KAWA',
          name: 'Test',
          sourceType: 'google_sheets',
          format: 'kawa',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = (await controller.previewConfig(1)) as {
        imported: number
        updated: number
        skipped: number
        errors: string[]
      }

      expect(result.imported).toBe(1)
      expect(result.updated).toBe(0)
      expect(insertCalls).toHaveLength(0) // No actual inserts for preview
    })
  })
})

describe('GoogleSheetsImportController', () => {
  let controller: GoogleSheetsImportController

  beforeEach(() => {
    controller = new GoogleSheetsImportController()
    controller.setStatus = vi.fn()
    vi.clearAllMocks()

    // Reset mocks
    mockImportConfigsResult = []
    mockPriceListsResult = []
    mockLocationsResult = []
    mockCommoditiesResult = []
    mockPricesResult = []
    mockSheetContent = ''
    mockInsertedId = 1
    insertCalls = []
    updateCalls = []
  })

  describe('importFromGoogleSheets', () => {
    it('should throw BadRequest for invalid Google Sheets URL', async () => {
      await expect(
        controller.importFromGoogleSheets({
          url: 'https://invalid-url.com/sheet',
          priceListCode: 'KAWA',
          fieldMapping: { ticker: 'Ticker', price: 'Price' },
        })
      ).rejects.toThrow('Invalid Google Sheets URL')
    })

    it('should throw BadRequest for invalid price list', async () => {
      mockPriceListsResult = []

      await expect(
        controller.importFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'INVALID',
          fieldMapping: { ticker: 'Ticker', price: 'Price' },
        })
      ).rejects.toThrow("Price list 'INVALID' not found")
    })

    it('should throw BadRequest when ticker field mapping is missing', async () => {
      mockPriceListsResult = [{ code: 'KAWA' }]

      await expect(
        controller.importFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
          fieldMapping: { ticker: '', price: 'Price' },
        })
      ).rejects.toThrow('fieldMapping must include ticker and price fields')
    })

    it('should throw BadRequest when price field mapping is missing', async () => {
      mockPriceListsResult = [{ code: 'KAWA' }]

      await expect(
        controller.importFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
          fieldMapping: { ticker: 'Ticker', price: '' },
        })
      ).rejects.toThrow('fieldMapping must include ticker and price fields')
    })

    it('should throw BadRequest when fetch fails', async () => {
      mockPriceListsResult = [{ code: 'KAWA' }]
      mockSheetContent = 'ERROR'

      await expect(
        controller.importFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
          fieldMapping: { ticker: 'Ticker', price: 'Price' },
        })
      ).rejects.toThrow('Failed to fetch')
    })

    it('should import successfully with valid parameters', async () => {
      mockPriceListsResult = [{ code: 'KAWA' }]
      mockSheetContent = `Ticker,Price
DW,24`

      const result = await controller.importFromGoogleSheets({
        url: 'https://docs.google.com/spreadsheets/d/test',
        priceListCode: 'kawa',
        fieldMapping: { ticker: 'Ticker', price: 'Price' },
      })

      expect(result).toBeDefined()
    })
  })

  describe('importPivotFromGoogleSheets', () => {
    beforeEach(() => {
      mockLocationsResult = [
        { naturalId: 'MON', name: 'Montem' },
        { naturalId: 'BEN', name: 'Benten' },
      ]
      mockCommoditiesResult = [{ ticker: 'DW' }, { ticker: 'RAT' }]
      mockPriceListsResult = [{ code: 'KAWA' }]
    })

    it('should throw BadRequest for invalid URL', async () => {
      await expect(
        controller.importPivotFromGoogleSheets({
          url: 'https://invalid-url.com/sheet',
          priceListCode: 'KAWA',
        })
      ).rejects.toThrow('Invalid Google Sheets URL')
    })

    it('should throw BadRequest for invalid price list', async () => {
      mockPriceListsResult = []

      await expect(
        controller.importPivotFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'INVALID',
        })
      ).rejects.toThrow("Price list 'INVALID' not found")
    })

    it('should throw BadRequest when fetch fails', async () => {
      mockSheetContent = 'ERROR'

      await expect(
        controller.importPivotFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
        })
      ).rejects.toThrow('Failed to fetch')
    })

    it('should throw BadRequest for insufficient rows', async () => {
      mockSheetContent = 'Ticker,Montem'

      await expect(
        controller.importPivotFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
        })
      ).rejects.toThrow('Sheet must have at least a header row and one data row')
    })

    it('should throw BadRequest when no ticker column found', async () => {
      mockSheetContent = `Name,Montem,Benten
DW,24,25`

      await expect(
        controller.importPivotFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
        })
      ).rejects.toThrow('Could not find Ticker column')
    })

    it('should throw BadRequest when no location columns found', async () => {
      mockSheetContent = `Ticker,Unknown1,Unknown2
DW,24,25`

      await expect(
        controller.importPivotFromGoogleSheets({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
        })
      ).rejects.toThrow('No location columns found')
    })

    it('should import pivot format successfully', async () => {
      mockSheetContent = `Ticker,Montem,Benten
DW,24,25
RAT,39,40`
      mockPricesResult = []

      const result = await controller.importPivotFromGoogleSheets({
        url: 'https://docs.google.com/spreadsheets/d/test',
        priceListCode: 'KAWA',
      })

      expect(result.imported).toBe(4)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle unknown tickers in pivot format', async () => {
      mockSheetContent = `Ticker,Montem
UNKNOWN,24
DW,25`
      mockPricesResult = []

      const result = await controller.importPivotFromGoogleSheets({
        url: 'https://docs.google.com/spreadsheets/d/test',
        priceListCode: 'KAWA',
      })

      expect(result.imported).toBe(1)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should handle invalid prices in pivot format', async () => {
      mockSheetContent = `Ticker,Montem
DW,invalid`
      mockPricesResult = []

      const result = await controller.importPivotFromGoogleSheets({
        url: 'https://docs.google.com/spreadsheets/d/test',
        priceListCode: 'KAWA',
      })

      expect(result.imported).toBe(0)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should update existing prices in pivot format', async () => {
      mockSheetContent = `Ticker,Montem
DW,30`
      mockPricesResult = [{ id: 100 }]

      const result = await controller.importPivotFromGoogleSheets({
        url: 'https://docs.google.com/spreadsheets/d/test',
        priceListCode: 'KAWA',
      })

      expect(result.imported).toBe(0)
      expect(result.updated).toBe(1)
    })
  })

  describe('previewGoogleSheetsImport', () => {
    it('should throw BadRequest when fetch fails', async () => {
      mockSheetContent = 'ERROR'

      await expect(
        controller.previewGoogleSheetsImport({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
          fieldMapping: { ticker: 'Ticker', price: 'Price' },
        })
      ).rejects.toThrow('Failed to fetch')
    })

    it('should throw BadRequest when ticker mapping is missing', async () => {
      mockSheetContent = `Ticker,Price
DW,24`

      await expect(
        controller.previewGoogleSheetsImport({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
          fieldMapping: { ticker: '', price: 'Price' },
        })
      ).rejects.toThrow('fieldMapping must include ticker and price fields')
    })

    it('should throw BadRequest when price mapping is missing', async () => {
      mockSheetContent = `Ticker,Price
DW,24`

      await expect(
        controller.previewGoogleSheetsImport({
          url: 'https://docs.google.com/spreadsheets/d/test',
          priceListCode: 'KAWA',
          fieldMapping: { ticker: 'Ticker', price: '' },
        })
      ).rejects.toThrow('fieldMapping must include ticker and price fields')
    })

    it('should preview successfully with valid parameters', async () => {
      mockSheetContent = `Ticker,Price
DW,24`

      const result = await controller.previewGoogleSheetsImport({
        url: 'https://docs.google.com/spreadsheets/d/test',
        priceListCode: 'KAWA',
        fieldMapping: { ticker: 'Ticker', price: 'Price' },
      })

      expect(result).toBeDefined()
    })
  })
})
