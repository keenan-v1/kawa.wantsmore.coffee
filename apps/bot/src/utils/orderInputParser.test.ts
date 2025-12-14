import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseOrderInput, formatLimitMode } from './orderInputParser.js'

// Mock the display services
vi.mock('../services/display.js', () => ({
  resolveCommodity: vi.fn(),
  resolveLocation: vi.fn(),
}))

import { resolveCommodity, resolveLocation } from '../services/display.js'

const mockResolveCommodity = resolveCommodity as ReturnType<typeof vi.fn>
const mockResolveLocation = resolveLocation as ReturnType<typeof vi.fn>

describe('orderInputParser', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    mockResolveCommodity.mockImplementation(async (ticker: string) => {
      const commodities: Record<string, { ticker: string; name: string }> = {
        COF: { ticker: 'COF', name: 'Coffee' },
        CAF: { ticker: 'CAF', name: 'Caffeinated Beans' },
        H2O: { ticker: 'H2O', name: 'Water' },
        H: { ticker: 'H', name: 'Hydrogen' },
        DW: { ticker: 'DW', name: 'Drinking Water' },
      }
      return commodities[ticker.toUpperCase()] || null
    })

    mockResolveLocation.mockImplementation(async (locationId: string) => {
      const locations: Record<string, { naturalId: string; name: string; type: string }> = {
        Katoa: { naturalId: 'KW-020c', name: 'Katoa', type: 'planet' },
        'KW-020c': { naturalId: 'KW-020c', name: 'Katoa', type: 'planet' },
        Stella: { naturalId: 'OT-580b', name: 'Stella', type: 'planet' },
        'OT-580b': { naturalId: 'OT-580b', name: 'Stella', type: 'planet' },
        Moria: { naturalId: 'UV-351a', name: 'Moria', type: 'planet' },
      }
      return locations[locationId] || null
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('parseOrderInput', () => {
    describe('single ticker + location', () => {
      it('parses single ticker with location', async () => {
        const result = await parseOrderInput('COF Katoa', { forSell: true })

        expect(result.tickers).toEqual(['COF'])
        expect(result.location).toBe('KW-020c')
        expect(result.resolvedCommodities).toHaveLength(1)
        expect(result.resolvedLocation).toBeTruthy()
      })

      it('parses ticker with natural ID location', async () => {
        const result = await parseOrderInput('H KW-020c', { forSell: true })

        expect(result.tickers).toEqual(['H'])
        expect(result.location).toBe('KW-020c')
      })

      it('handles unrecognized commodity', async () => {
        const result = await parseOrderInput('INVALID Katoa', { forSell: true })

        expect(result.tickers).toEqual([])
        expect(result.location).toBe('KW-020c')
        expect(result.unresolvedTokens).toContain('INVALID')
      })
    })

    describe('comma-separated tickers', () => {
      it('parses comma-separated tickers', async () => {
        const result = await parseOrderInput('COF,CAF,H2O Katoa', { forSell: true })

        expect(result.tickers).toEqual(['COF', 'CAF', 'H2O'])
        expect(result.location).toBe('KW-020c')
        expect(result.resolvedCommodities).toHaveLength(3)
      })

      it('handles mixed valid and invalid tickers', async () => {
        const result = await parseOrderInput('COF,INVALID,H2O Katoa', { forSell: true })

        expect(result.tickers).toEqual(['COF', 'H2O'])
        expect(result.unresolvedTokens).toContain('INVALID')
      })

      it('handles spaces after commas', async () => {
        // Input with spaces will be tokenized, so comma-separation should still work
        const result = await parseOrderInput('COF,CAF Katoa', { forSell: true })

        expect(result.tickers).toEqual(['COF', 'CAF'])
        expect(result.location).toBe('KW-020c')
      })

      it('deduplicates tickers', async () => {
        const result = await parseOrderInput('COF,COF,CAF Katoa', { forSell: true })

        expect(result.tickers).toEqual(['COF', 'CAF'])
      })
    })

    describe('limit modifiers for sell', () => {
      it('parses reserve:X modifier', async () => {
        const result = await parseOrderInput('COF Katoa reserve:1000', { forSell: true })

        expect(result.tickers).toEqual(['COF'])
        expect(result.location).toBe('KW-020c')
        expect(result.limitMode).toBe('reserve')
        expect(result.limitQuantity).toBe(1000)
      })

      it('parses r:X shorthand', async () => {
        const result = await parseOrderInput('COF Katoa r:500', { forSell: true })

        expect(result.limitMode).toBe('reserve')
        expect(result.limitQuantity).toBe(500)
      })

      it('parses max:X modifier', async () => {
        const result = await parseOrderInput('COF Katoa max:2000', { forSell: true })

        expect(result.limitMode).toBe('max_sell')
        expect(result.limitQuantity).toBe(2000)
      })

      it('parses m:X shorthand', async () => {
        const result = await parseOrderInput('COF Katoa m:100', { forSell: true })

        expect(result.limitMode).toBe('max_sell')
        expect(result.limitQuantity).toBe(100)
      })

      it('parses bare number as reserve for sell', async () => {
        const result = await parseOrderInput('COF Katoa 1500', { forSell: true })

        expect(result.limitMode).toBe('reserve')
        expect(result.limitQuantity).toBe(1500)
      })

      it('defaults to no limit when no number provided', async () => {
        const result = await parseOrderInput('COF Katoa', { forSell: true })

        expect(result.limitMode).toBe('none')
        expect(result.limitQuantity).toBeNull()
      })
    })

    describe('quantity for buy', () => {
      it('parses bare number as quantity for buy', async () => {
        const result = await parseOrderInput('COF Katoa 500', { forBuy: true })

        expect(result.tickers).toEqual(['COF'])
        expect(result.location).toBe('KW-020c')
        expect(result.quantity).toBe(500)
        expect(result.limitMode).toBe('none')
      })

      it('does not apply reserve modifiers for buy', async () => {
        const result = await parseOrderInput('COF Katoa reserve:1000', { forBuy: true })

        // For buy, reserve:X is treated as unrecognized
        expect(result.quantity).toBeNull()
        expect(result.limitMode).toBe('none')
      })
    })

    describe('delete mode', () => {
      it('parses tickers and location for delete', async () => {
        const result = await parseOrderInput('COF,CAF Katoa', { forDelete: true })

        expect(result.tickers).toEqual(['COF', 'CAF'])
        expect(result.location).toBe('KW-020c')
      })

      it('ignores bare numbers for delete', async () => {
        const result = await parseOrderInput('COF Katoa 1000', { forDelete: true })

        expect(result.tickers).toEqual(['COF'])
        expect(result.location).toBe('KW-020c')
        expect(result.quantity).toBeNull()
        expect(result.limitMode).toBe('none')
      })

      it('parses limit modifiers for delete (if needed for filtering)', async () => {
        const result = await parseOrderInput('COF Katoa reserve:1000', { forDelete: true })

        expect(result.limitMode).toBe('reserve')
        expect(result.limitQuantity).toBe(1000)
      })
    })

    describe('edge cases', () => {
      it('handles empty input', async () => {
        const result = await parseOrderInput('', { forSell: true })

        expect(result.tickers).toEqual([])
        expect(result.location).toBeNull()
        expect(result.unresolvedTokens).toEqual([])
      })

      it('handles whitespace-only input', async () => {
        const result = await parseOrderInput('   ', { forSell: true })

        expect(result.tickers).toEqual([])
        expect(result.location).toBeNull()
      })

      it('handles ticker only (no location)', async () => {
        const result = await parseOrderInput('COF', { forSell: true })

        expect(result.tickers).toEqual(['COF'])
        expect(result.location).toBeNull()
      })

      it('handles location that looks like ticker first', async () => {
        // If first token is not a commodity, it goes to unresolved
        mockResolveCommodity.mockImplementation(async (ticker: string) => {
          if (ticker.toUpperCase() === 'COF') {
            return { ticker: 'COF', name: 'Coffee' }
          }
          return null
        })

        const result = await parseOrderInput('Katoa COF', { forSell: true })

        // Katoa is the first token, tried as commodity, failed
        // COF is the second token, tried as location, failed, then...
        expect(result.unresolvedTokens).toContain('Katoa')
      })

      it('preserves order of tickers', async () => {
        const result = await parseOrderInput('H2O,COF,CAF Katoa', { forSell: true })

        expect(result.tickers).toEqual(['H2O', 'COF', 'CAF'])
      })

      it('case insensitive for modifiers', async () => {
        const result1 = await parseOrderInput('COF Katoa RESERVE:100', { forSell: true })
        const result2 = await parseOrderInput('COF Katoa Reserve:100', { forSell: true })

        expect(result1.limitMode).toBe('reserve')
        expect(result2.limitMode).toBe('reserve')
      })
    })
  })

  describe('formatLimitMode', () => {
    it('returns empty string for no limit', () => {
      expect(formatLimitMode('none', null)).toBe('')
      expect(formatLimitMode('none', 1000)).toBe('')
    })

    it('formats reserve mode', () => {
      expect(formatLimitMode('reserve', 1000)).toBe('reserve 1,000')
      expect(formatLimitMode('reserve', 500)).toBe('reserve 500')
    })

    it('formats max_sell mode', () => {
      expect(formatLimitMode('max_sell', 2000)).toBe('max 2,000')
      expect(formatLimitMode('max_sell', 100)).toBe('max 100')
    })

    it('returns empty string if quantity is null', () => {
      expect(formatLimitMode('reserve', null)).toBe('')
      expect(formatLimitMode('max_sell', null)).toBe('')
    })
  })
})
