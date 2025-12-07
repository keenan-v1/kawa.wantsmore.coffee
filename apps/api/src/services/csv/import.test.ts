import { describe, it, expect, vi, beforeEach } from 'vitest'
import { previewCsvImport, importCsvPrices } from './import.js'
import { db } from '../../db/index.js'

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
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
    updatedAt: 'updatedAt',
  },
  fioCommodities: {
    ticker: 'ticker',
  },
  fioLocations: {
    naturalId: 'naturalId',
  },
  fioExchanges: {
    code: 'code',
  },
}))

describe('CSV Import Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('previewCsvImport', () => {
    it('should preview valid CSV data', async () => {
      const csv = `Ticker,Location,Price
H2O,BEN,100
RAT,BEN,50`

      // Mock commodities lookup
      const mockCommoditiesSelect = {
        from: vi.fn().mockResolvedValue([{ ticker: 'H2O' }, { ticker: 'RAT' }]),
      }
      // Mock locations lookup
      const mockLocationsSelect = {
        from: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }
      // Mock exchange lookup
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCommoditiesSelect as any)
        .mockReturnValueOnce(mockLocationsSelect as any)
        .mockReturnValueOnce(mockExchangeSelect as any)

      const result = await previewCsvImport(csv, {
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, location: 1, price: 2 },
        currencyDefault: 'CIS',
      })

      expect(result.headers).toEqual(['Ticker', 'Location', 'Price'])
      expect(result.sampleRows).toHaveLength(2)
      expect(result.validRows).toBe(2)
      expect(result.totalRows).toBe(2)
      expect(result.parseErrors).toHaveLength(0)
      expect(result.validationErrors).toHaveLength(0)
    })

    it('should report validation errors for unknown commodities', async () => {
      const csv = `Ticker,Price
UNKNOWN,100`

      const mockCommoditiesSelect = {
        from: vi.fn().mockResolvedValue([{ ticker: 'H2O' }]),
      }
      const mockLocationsSelect = {
        from: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCommoditiesSelect as any)
        .mockReturnValueOnce(mockLocationsSelect as any)
        .mockReturnValueOnce(mockExchangeSelect as any)

      const result = await previewCsvImport(csv, {
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.validRows).toBe(0)
      expect(result.validationErrors).toHaveLength(1)
      expect(result.validationErrors[0].field).toBe('ticker')
      expect(result.validationErrors[0].message).toContain('not found')
    })

    it('should report validation errors for unknown locations', async () => {
      const csv = `Ticker,Location,Price
H2O,UNKNOWN,100`

      const mockCommoditiesSelect = {
        from: vi.fn().mockResolvedValue([{ ticker: 'H2O' }]),
      }
      const mockLocationsSelect = {
        from: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCommoditiesSelect as any)
        .mockReturnValueOnce(mockLocationsSelect as any)
        .mockReturnValueOnce(mockExchangeSelect as any)

      const result = await previewCsvImport(csv, {
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, location: 1, price: 2 },
        currencyDefault: 'CIS',
      })

      expect(result.validRows).toBe(0)
      expect(result.validationErrors).toHaveLength(1)
      expect(result.validationErrors[0].field).toBe('location')
    })

    it('should report error for unknown exchange', async () => {
      const csv = `Ticker,Price
H2O,100`

      const mockCommoditiesSelect = {
        from: vi.fn().mockResolvedValue([{ ticker: 'H2O' }]),
      }
      const mockLocationsSelect = {
        from: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCommoditiesSelect as any)
        .mockReturnValueOnce(mockLocationsSelect as any)
        .mockReturnValueOnce(mockExchangeSelect as any)

      const result = await previewCsvImport(csv, {
        exchangeCode: 'INVALID',
        mapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.validRows).toBe(0)
      expect(result.validationErrors).toHaveLength(1)
      expect(result.validationErrors[0].field).toBe('exchange')
    })
  })

  describe('importCsvPrices', () => {
    it('should import new prices', async () => {
      const csv = `Ticker,Price
H2O,100`

      const mockCommoditiesSelect = {
        from: vi.fn().mockResolvedValue([{ ticker: 'H2O' }]),
      }
      const mockLocationsSelect = {
        from: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }
      const mockExistingPriceSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      const mockInsert = {
        values: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCommoditiesSelect as any)
        .mockReturnValueOnce(mockLocationsSelect as any)
        .mockReturnValueOnce(mockExchangeSelect as any)
        .mockReturnValueOnce(mockExistingPriceSelect as any)

      vi.mocked(db.insert).mockReturnValue(mockInsert as any)

      const result = await importCsvPrices(csv, {
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.imported).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.errors).toHaveLength(0)
      expect(db.insert).toHaveBeenCalled()
    })

    it('should update existing prices', async () => {
      const csv = `Ticker,Price
H2O,100`

      const mockCommoditiesSelect = {
        from: vi.fn().mockResolvedValue([{ ticker: 'H2O' }]),
      }
      const mockLocationsSelect = {
        from: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }
      const mockExistingPriceSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 1 }]),
      }
      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCommoditiesSelect as any)
        .mockReturnValueOnce(mockLocationsSelect as any)
        .mockReturnValueOnce(mockExchangeSelect as any)
        .mockReturnValueOnce(mockExistingPriceSelect as any)

      vi.mocked(db.update).mockReturnValue(mockUpdate as any)

      const result = await importCsvPrices(csv, {
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.imported).toBe(0)
      expect(result.updated).toBe(1)
      expect(result.skipped).toBe(0)
      expect(db.update).toHaveBeenCalled()
    })

    it('should skip rows with validation errors', async () => {
      const csv = `Ticker,Price
H2O,100
UNKNOWN,50`

      const mockCommoditiesSelect = {
        from: vi.fn().mockResolvedValue([{ ticker: 'H2O' }]),
      }
      const mockLocationsSelect = {
        from: vi.fn().mockResolvedValue([{ naturalId: 'BEN' }]),
      }
      const mockExchangeSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ code: 'KAWA' }]),
      }
      const mockExistingPriceSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      const mockInsert = {
        values: vi.fn().mockResolvedValue([]),
      }

      vi.mocked(db.select)
        .mockReturnValueOnce(mockCommoditiesSelect as any)
        .mockReturnValueOnce(mockLocationsSelect as any)
        .mockReturnValueOnce(mockExchangeSelect as any)
        .mockReturnValueOnce(mockExistingPriceSelect as any)

      vi.mocked(db.insert).mockReturnValue(mockInsert as any)

      const result = await importCsvPrices(csv, {
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.imported).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.skipped).toBe(1)
      expect(result.errors).toHaveLength(1)
    })
  })
})
