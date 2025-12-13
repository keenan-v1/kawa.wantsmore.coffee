import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  formatCommodity,
  resolveCommodity,
  getCommodity,
  getAllCommodities,
  clearCommodityCache,
  _setCache,
  type CommodityInfo,
} from './commodityService.js'

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockResolvedValue([]),
  },
  fioCommodities: {},
}))

describe('commodityService', () => {
  const mockCommodities: CommodityInfo[] = [
    { ticker: 'H2O', name: 'Water', categoryName: 'Consumables' },
    { ticker: 'RAT', name: 'Rations', categoryName: 'Consumables' },
    { ticker: 'COF', name: 'Caffeinated Infusion', categoryName: 'Consumables' },
    { ticker: 'FE', name: 'Iron', categoryName: 'Metals' },
  ]

  beforeEach(() => {
    // Set up mock cache before each test
    const cache = new Map<string, CommodityInfo>()
    for (const c of mockCommodities) {
      cache.set(c.ticker.toUpperCase(), c)
    }
    _setCache(cache)
  })

  describe('formatCommodity', () => {
    it('returns ticker in uppercase', () => {
      expect(formatCommodity('h2o')).toBe('H2O')
      expect(formatCommodity('H2O')).toBe('H2O')
      expect(formatCommodity('rat')).toBe('RAT')
    })

    it('handles mixed case input', () => {
      expect(formatCommodity('CoF')).toBe('COF')
      expect(formatCommodity('Fe')).toBe('FE')
    })

    it('handles empty string', () => {
      expect(formatCommodity('')).toBe('')
    })
  })

  describe('resolveCommodity', () => {
    it('resolves valid ticker (lowercase input)', async () => {
      const result = await resolveCommodity('h2o')
      expect(result).toEqual({ ticker: 'H2O', name: 'Water' })
    })

    it('resolves valid ticker (uppercase input)', async () => {
      const result = await resolveCommodity('H2O')
      expect(result).toEqual({ ticker: 'H2O', name: 'Water' })
    })

    it('resolves valid ticker (mixed case input)', async () => {
      const result = await resolveCommodity('RaT')
      expect(result).toEqual({ ticker: 'RAT', name: 'Rations' })
    })

    it('returns null for invalid ticker', async () => {
      const result = await resolveCommodity('INVALID')
      expect(result).toBeNull()
    })

    it('returns null for empty string', async () => {
      const result = await resolveCommodity('')
      expect(result).toBeNull()
    })

    it('does not match partial tickers', async () => {
      const result = await resolveCommodity('H2')
      expect(result).toBeNull()
    })

    it('does not match by name', async () => {
      const result = await resolveCommodity('Water')
      expect(result).toBeNull()
    })
  })

  describe('getCommodity', () => {
    it('returns full commodity info for valid ticker', async () => {
      const result = await getCommodity('H2O')
      expect(result).toEqual({
        ticker: 'H2O',
        name: 'Water',
        categoryName: 'Consumables',
      })
    })

    it('returns null for invalid ticker', async () => {
      const result = await getCommodity('INVALID')
      expect(result).toBeNull()
    })

    it('is case-insensitive', async () => {
      const result = await getCommodity('cof')
      expect(result).toEqual({
        ticker: 'COF',
        name: 'Caffeinated Infusion',
        categoryName: 'Consumables',
      })
    })
  })

  describe('getAllCommodities', () => {
    it('returns all cached commodities', async () => {
      const result = await getAllCommodities()
      expect(result).toHaveLength(4)
      expect(result).toContainEqual({
        ticker: 'H2O',
        name: 'Water',
        categoryName: 'Consumables',
      })
    })

    it('returns empty array when cache is empty', async () => {
      _setCache(new Map())
      const result = await getAllCommodities()
      expect(result).toEqual([])
    })
  })

  describe('clearCommodityCache', () => {
    it('clears the cache', async () => {
      // Verify cache is populated
      const before = await getCommodity('H2O')
      expect(before).not.toBeNull()

      // Clear cache
      clearCommodityCache()

      // Cache should be null, next call will try to load from DB (which is mocked to return empty)
      _setCache(null)
      const after = await getCommodity('H2O')
      expect(after).toBeNull()
    })
  })
})
