import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportConfigsController } from './ImportConfigsController.js'

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
    return Promise.resolve({ success: true, content: mockSheetContent })
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

  describe('getConfigs', () => {
    it('should return all import configurations', async () => {
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

      const result = await controller.getConfigs()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('KAWA Price Sheet')
      expect(result[0].format).toBe('kawa')
    })

    it('should return empty array when no configs', async () => {
      const result = await controller.getConfigs()
      expect(result).toHaveLength(0)
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
