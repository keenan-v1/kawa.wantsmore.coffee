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
const mockPriceListsResult = vi.fn()
const mockCommoditiesResult = vi.fn()
const mockPricesResult = vi.fn()
const mockInsertValues = vi.fn()
const mockInsertOnConflict = vi.fn()

vi.mock('../../db/index.js', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        // Route to different mocks based on table
        if (table === 'priceLists') {
          return {
            where: () => mockPriceListsResult(),
          }
        } else if (table === 'fioCommodities') {
          return mockCommoditiesResult()
        } else if (table === 'prices') {
          // Return object with where method that supports both direct await and chaining
          return {
            where: () => {
              // Create a Promise-like object that can also be chained
              const resultPromise = Promise.resolve().then(() => mockPricesResult())
              return Object.assign(resultPromise, {
                orderBy: () => ({
                  limit: () => Promise.resolve().then(() => mockPricesResult()),
                }),
              })
            },
          }
        }
        return mockCommoditiesResult()
      },
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
  prices: 'prices',
  priceLists: 'priceLists',
  fioCommodities: 'fioCommodities',
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
    mockPriceListsResult.mockReset()
    mockCommoditiesResult.mockReset()
    mockPricesResult.mockReset()
    mockInsertValues.mockReset()
    mockInsertOnConflict.mockReset()
    mockGetPrices.mockReset()

    // Default mock implementations
    mockPriceListsResult.mockResolvedValue([])
    mockCommoditiesResult.mockResolvedValue([])
    mockPricesResult.mockReturnValue([])

    mockInsertValues.mockReturnValue({
      onConflictDoUpdate: mockInsertOnConflict,
    })
    mockInsertOnConflict.mockResolvedValue(undefined)
  })

  it('should sync prices from all FIO exchanges', async () => {
    // Mock price lists (FIO exchanges)
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
      { code: 'NC1', defaultLocationId: 'MOR', currency: 'NCC' },
    ])

    // Mock valid tickers
    mockCommoditiesResult.mockResolvedValue([
      { ticker: 'H2O' },
      { ticker: 'RAT' },
      { ticker: 'ALO' },
    ])

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
    // Mock price lists
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
      { code: 'NC1', defaultLocationId: 'MOR', currency: 'NCC' },
    ])

    // Mock valid tickers
    mockCommoditiesResult.mockResolvedValue([
      { ticker: 'H2O' },
      { ticker: 'RAT' },
      { ticker: 'ALO' },
    ])

    // Mock FIO API response
    mockGetPrices.mockResolvedValue(sampleCsvPrices)

    const result = await syncFioExchangePrices('CI1')

    expect(result.success).toBe(true)
    expect(result.exchanges.length).toBe(1)
    expect(result.exchanges[0].exchangeCode).toBe('CI1')
    expect(result.totalUpdated).toBe(3)
  })

  it('should use the configured price field', async () => {
    // Mock price lists
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
    ])

    // Mock valid tickers
    mockCommoditiesResult.mockResolvedValue([{ ticker: 'H2O' }])

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
    // Mock price lists
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
    ])

    // Mock valid tickers - only H2O exists
    mockCommoditiesResult.mockResolvedValue([{ ticker: 'H2O' }])

    // Mock FIO API response with multiple commodities
    mockGetPrices.mockResolvedValue(sampleCsvPrices)

    const result = await syncFioExchangePrices('CI1')

    expect(result.success).toBe(true)
    expect(result.exchanges[0].pricesUpdated).toBe(1) // Only H2O
    expect(result.exchanges[0].pricesSkipped).toBe(3) // RAT, FE, ALO not in DB
  })

  it('should skip prices with null or zero values', async () => {
    // Mock price lists
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
    ])

    // Mock valid tickers - H2O and FE are valid
    mockCommoditiesResult.mockResolvedValue([{ ticker: 'H2O' }, { ticker: 'FE' }])

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
    // Mock price lists without UNKNOWN
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
    ])

    const result = await syncFioExchangePrices('UNKNOWN')

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('UNKNOWN')
  })

  it('should return error when no commodities exist', async () => {
    // Mock price lists
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
    ])

    // Mock empty commodities
    mockCommoditiesResult.mockResolvedValue([])

    const result = await syncFioExchangePrices('CI1')

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('commodities')
  })

  it('should handle API errors gracefully', async () => {
    // Mock price lists
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
    ])

    // Mock valid tickers
    mockCommoditiesResult.mockResolvedValue([{ ticker: 'H2O' }])

    // Mock API error
    mockGetPrices.mockRejectedValue(new Error('API connection failed'))

    const result = await syncFioExchangePrices('CI1')

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('API connection failed')
  })

  it('should filter out KAWA from FIO exchanges', async () => {
    // Mock price lists including KAWA (but KAWA has type='custom' so wouldn't be returned by getFioPriceLists)
    // Since we only query type='fio', KAWA won't appear
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
    ])

    // Mock valid tickers
    mockCommoditiesResult.mockResolvedValue([{ ticker: 'H2O' }])

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
    mockPricesResult.mockReset()
  })

  it('should return the last sync time for an exchange', async () => {
    const syncTime = new Date('2025-12-07T12:00:00Z')

    mockPricesResult.mockReturnValue([{ updatedAt: syncTime }])

    const result = await getLastSyncTime('CI1')

    expect(result).toEqual(syncTime)
  })

  it('should return null if no prices exist for exchange', async () => {
    mockPricesResult.mockReturnValue([])

    const result = await getLastSyncTime('CI1')

    expect(result).toBeNull()
  })
})

describe('getFioExchangeSyncStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPriceListsResult.mockReset()
    mockPricesResult.mockReset()
  })

  it('should return sync status for all FIO exchanges', async () => {
    const syncTime = new Date('2025-12-07T12:00:00Z')
    const syncTime2 = new Date('2025-12-06T12:00:00Z')

    // Mock price lists
    mockPriceListsResult.mockResolvedValue([
      { code: 'CI1', defaultLocationId: 'BEN', currency: 'CIS' },
      { code: 'NC1', defaultLocationId: 'MOR', currency: 'NCC' },
    ])

    // Mock price count and sync time for each exchange - use mockReturnValueOnce
    // because the promise is created in the mock, not the return value
    mockPricesResult
      .mockReturnValueOnce([{ id: 1, updatedAt: syncTime }])
      .mockReturnValueOnce([{ id: 2, updatedAt: syncTime2 }])

    const result = await getFioExchangeSyncStatus()

    expect(result.length).toBe(2)
    expect(result[0].exchangeCode).toBe('CI1')
    expect(result[0].lastSyncedAt).toEqual(syncTime)
  })
})
