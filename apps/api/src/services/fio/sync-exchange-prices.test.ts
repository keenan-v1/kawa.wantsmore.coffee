import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  syncFioExchangePrices,
  getLastSyncTime,
  getFioExchangeSyncStatus,
} from './sync-exchange-prices.js'

// Mock the FIO client
const mockGetPrices = vi.fn()

vi.mock('./client.js', () => ({
  fioClient: {
    getPrices: () => mockGetPrices(),
  },
}))

// Mock the database
const mockSelectFrom = vi.fn()
const mockSelectOrderBy = vi.fn()
const mockSelectLimit = vi.fn()
const mockSelectWhere = vi.fn()
const mockInsertValues = vi.fn()
const mockInsertOnConflict = vi.fn()

vi.mock('../../db/index.js', () => ({
  db: {
    select: () => ({
      from: mockSelectFrom,
    }),
    insert: () => ({
      values: mockInsertValues,
    }),
    update: () => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    }),
  },
  priceLists: {
    id: 'id',
    exchangeCode: 'exchange_code',
    commodityTicker: 'commodity_ticker',
    locationId: 'location_id',
    price: 'price',
    currency: 'currency',
    source: 'source',
    sourceReference: 'source_reference',
    updatedAt: 'updated_at',
  },
  fioExchanges: {
    code: 'code',
    name: 'name',
    locationId: 'location_id',
    currency: 'currency',
  },
  fioCommodities: {
    ticker: 'ticker',
  },
}))

// Sample FIO CSV price data
const sampleCsvPrices = `Ticker,ExchangeCode,MMBuy,MMSell,PriceAverage,Ask,Bid
H2O,CI1,10.5,12.0,11.25,11.0,11.5
RAT,CI1,50.0,55.0,52.5,51.0,54.0
H2O,NC1,11.0,13.0,12.0,11.5,12.5
FE,CI1,,,,
ALO,CI1,100.0,110.0,105.0,102.0,108.0`

describe('syncFioExchangePrices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectFrom.mockReset()
    mockSelectOrderBy.mockReset()
    mockSelectLimit.mockReset()
    mockSelectWhere.mockReset()
    mockInsertValues.mockReset()
    mockInsertOnConflict.mockReset()
    mockGetPrices.mockReset()

    // Default mock implementations
    mockSelectFrom.mockReturnValue({
      orderBy: mockSelectOrderBy,
      where: mockSelectWhere,
      limit: mockSelectLimit,
    })
    mockSelectOrderBy.mockReturnValue({
      limit: mockSelectLimit,
    })
    mockSelectLimit.mockResolvedValue([])
    mockSelectWhere.mockReturnValue({
      orderBy: mockSelectOrderBy,
      limit: mockSelectLimit,
    })

    mockInsertValues.mockReturnValue({
      onConflictDoUpdate: mockInsertOnConflict,
    })
    mockInsertOnConflict.mockResolvedValue(undefined)
  })

  it('should sync prices from all FIO exchanges', async () => {
    // Mock exchanges
    mockSelectFrom.mockResolvedValueOnce([
      { code: 'CI1', locationId: 'BEN', currency: 'CIS' },
      { code: 'NC1', locationId: 'MOR', currency: 'NCC' },
    ])

    // Mock valid tickers
    mockSelectFrom.mockResolvedValueOnce([{ ticker: 'H2O' }, { ticker: 'RAT' }, { ticker: 'ALO' }])

    // Mock FIO API response
    mockGetPrices.mockResolvedValue(sampleCsvPrices)

    const result = await syncFioExchangePrices()

    expect(result.success).toBe(true)
    expect(result.exchanges.length).toBe(2)

    // CI1 should have 3 prices (H2O, RAT, ALO - FE has no price)
    const ci1Result = result.exchanges.find(e => e.exchangeCode === 'CI1')
    expect(ci1Result).toBeDefined()
    expect(ci1Result!.pricesUpdated).toBe(3)
    expect(ci1Result!.pricesSkipped).toBe(1) // FE has no price

    // NC1 should have 1 price (H2O)
    const nc1Result = result.exchanges.find(e => e.exchangeCode === 'NC1')
    expect(nc1Result).toBeDefined()
    expect(nc1Result!.pricesUpdated).toBe(1)
    expect(nc1Result!.pricesSkipped).toBe(0)

    expect(result.totalUpdated).toBe(4)
    expect(result.totalSkipped).toBe(1)
  })

  it('should sync prices for a specific exchange only', async () => {
    // Mock exchanges (filtering for CI1)
    mockSelectFrom.mockResolvedValueOnce([
      { code: 'CI1', locationId: 'BEN', currency: 'CIS' },
      { code: 'NC1', locationId: 'MOR', currency: 'NCC' },
    ])

    // Mock valid tickers
    mockSelectFrom.mockResolvedValueOnce([{ ticker: 'H2O' }, { ticker: 'RAT' }, { ticker: 'ALO' }])

    // Mock FIO API response
    mockGetPrices.mockResolvedValue(sampleCsvPrices)

    const result = await syncFioExchangePrices('CI1')

    expect(result.success).toBe(true)
    expect(result.exchanges.length).toBe(1)
    expect(result.exchanges[0].exchangeCode).toBe('CI1')
    expect(result.totalUpdated).toBe(3)
  })

  it('should use the configured price field', async () => {
    // Mock exchanges
    mockSelectFrom.mockResolvedValueOnce([{ code: 'CI1', locationId: 'BEN', currency: 'CIS' }])

    // Mock valid tickers
    mockSelectFrom.mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Mock FIO API response
    mockGetPrices.mockResolvedValue(sampleCsvPrices)

    // Test different price fields
    const result = await syncFioExchangePrices('CI1', 'MMBuy')

    expect(result.success).toBe(true)
    // Verify that insert was called with correct price field
    expect(mockInsertValues).toHaveBeenCalled()
    const insertCall = mockInsertValues.mock.calls[0][0]
    expect(insertCall.price).toBe('10.50') // MMBuy for H2O on CI1
  })

  it('should skip unknown tickers', async () => {
    // Mock exchanges
    mockSelectFrom.mockResolvedValueOnce([{ code: 'CI1', locationId: 'BEN', currency: 'CIS' }])

    // Mock valid tickers - only H2O exists
    mockSelectFrom.mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Mock FIO API response with multiple commodities
    mockGetPrices.mockResolvedValue(sampleCsvPrices)

    const result = await syncFioExchangePrices('CI1')

    expect(result.success).toBe(true)
    expect(result.exchanges[0].pricesUpdated).toBe(1) // Only H2O
    expect(result.exchanges[0].pricesSkipped).toBe(3) // RAT, FE, ALO not in DB
  })

  it('should skip prices with null or zero values', async () => {
    // Mock exchanges
    mockSelectFrom.mockResolvedValueOnce([{ code: 'CI1', locationId: 'BEN', currency: 'CIS' }])

    // Mock valid tickers - H2O and FE are valid
    mockSelectFrom.mockResolvedValueOnce([{ ticker: 'H2O' }, { ticker: 'FE' }])

    // Mock FIO API response
    // CI1 has: H2O (price), RAT (unknown ticker), FE (no price), ALO (unknown ticker)
    mockGetPrices.mockResolvedValue(sampleCsvPrices)

    const result = await syncFioExchangePrices('CI1')

    expect(result.success).toBe(true)
    expect(result.exchanges[0].pricesUpdated).toBe(1) // Only H2O
    // Skipped: RAT (unknown), FE (no price), ALO (unknown)
    expect(result.exchanges[0].pricesSkipped).toBe(3)
  })

  it('should return error for unknown exchange code', async () => {
    // Mock exchanges without UNKNOWN
    mockSelectFrom.mockResolvedValueOnce([{ code: 'CI1', locationId: 'BEN', currency: 'CIS' }])

    const result = await syncFioExchangePrices('UNKNOWN')

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('UNKNOWN')
  })

  it('should return error when no commodities exist', async () => {
    // Mock exchanges
    mockSelectFrom.mockResolvedValueOnce([{ code: 'CI1', locationId: 'BEN', currency: 'CIS' }])

    // Mock empty commodities
    mockSelectFrom.mockResolvedValueOnce([])

    const result = await syncFioExchangePrices('CI1')

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('commodities')
  })

  it('should handle API errors gracefully', async () => {
    // Mock exchanges
    mockSelectFrom.mockResolvedValueOnce([{ code: 'CI1', locationId: 'BEN', currency: 'CIS' }])

    // Mock valid tickers
    mockSelectFrom.mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Mock API error
    mockGetPrices.mockRejectedValue(new Error('API connection failed'))

    const result = await syncFioExchangePrices('CI1')

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('API connection failed')
  })

  it('should filter out KAWA from FIO exchanges', async () => {
    // Mock exchanges including KAWA
    mockSelectFrom.mockResolvedValueOnce([
      { code: 'CI1', locationId: 'BEN', currency: 'CIS' },
      { code: 'KAWA', locationId: null, currency: 'CIS' },
    ])

    // Mock valid tickers
    mockSelectFrom.mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Mock FIO API response
    mockGetPrices.mockResolvedValue(sampleCsvPrices)

    const result = await syncFioExchangePrices()

    expect(result.success).toBe(true)
    expect(result.exchanges.length).toBe(1)
    expect(result.exchanges[0].exchangeCode).toBe('CI1')
    // KAWA should not be in the results
    expect(result.exchanges.find(e => e.exchangeCode === 'KAWA')).toBeUndefined()
  })
})

describe('getLastSyncTime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectFrom.mockReset()
  })

  it('should return the last sync time for an exchange', async () => {
    const syncTime = new Date('2025-12-07T12:00:00Z')

    mockSelectFrom.mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ updatedAt: syncTime }]),
        }),
      }),
    })

    const result = await getLastSyncTime('CI1')

    expect(result).toEqual(syncTime)
  })

  it('should return null if no prices exist for exchange', async () => {
    mockSelectFrom.mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    const result = await getLastSyncTime('CI1')

    expect(result).toBeNull()
  })
})

describe('getFioExchangeSyncStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectFrom.mockReset()
    mockSelectWhere.mockReset()
  })

  it('should return sync status for all FIO exchanges', async () => {
    const syncTime = new Date('2025-12-07T12:00:00Z')

    // Mock exchanges (first call)
    mockSelectFrom.mockResolvedValueOnce([
      { code: 'CI1', locationId: 'BEN', currency: 'CIS' },
      { code: 'NC1', locationId: 'MOR', currency: 'NCC' },
    ])

    // Mock price counts for each exchange
    mockSelectFrom
      .mockReturnValueOnce({
        where: vi.fn().mockResolvedValue([
          { count: 1, updatedAt: syncTime },
          { count: 1, updatedAt: new Date('2025-12-06T12:00:00Z') },
        ]),
      })
      .mockReturnValueOnce({
        where: vi.fn().mockResolvedValue([{ count: 1, updatedAt: syncTime }]),
      })

    const result = await getFioExchangeSyncStatus()

    expect(result.length).toBe(2)
    expect(result[0].exchangeCode).toBe('CI1')
    expect(result[0].priceCount).toBe(2)
    expect(result[0].lastSyncedAt).toEqual(syncTime)
  })
})
