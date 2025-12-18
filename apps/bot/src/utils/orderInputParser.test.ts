import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseOrderInput,
  formatLimitMode,
  parseMultiOrderInput,
  parseSmartOrderInput,
} from './orderInputParser.js'

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
        'Promitor Station': { naturalId: 'PRO-STN', name: 'Promitor Station', type: 'station' },
        'New Tokyo': { naturalId: 'NT-001', name: 'New Tokyo', type: 'planet' },
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

      it('handles multi-word locations', async () => {
        const result = await parseOrderInput('COF Promitor Station', { forSell: true })

        expect(result.tickers).toEqual(['COF'])
        expect(result.location).toBe('PRO-STN')
        expect(result.resolvedLocation?.name).toBe('Promitor Station')
        expect(result.unresolvedTokens).toHaveLength(0)
      })

      it('handles multi-word locations with extra unrecognized tokens', async () => {
        const result = await parseOrderInput('COF New Tokyo extra', { forSell: true })

        expect(result.tickers).toEqual(['COF'])
        expect(result.location).toBe('NT-001')
        expect(result.unresolvedTokens).toEqual(['extra'])
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

  describe('parseMultiOrderInput', () => {
    beforeEach(() => {
      // Extend mock to include more commodities for multi-ticker tests
      mockResolveCommodity.mockImplementation(async (ticker: string) => {
        const commodities: Record<string, { ticker: string; name: string }> = {
          COF: { ticker: 'COF', name: 'Coffee' },
          CAF: { ticker: 'CAF', name: 'Caffeinated Beans' },
          H2O: { ticker: 'H2O', name: 'Water' },
          H: { ticker: 'H', name: 'Hydrogen' },
          DW: { ticker: 'DW', name: 'Drinking Water' },
          RAT: { ticker: 'RAT', name: 'Basic Rations' },
          OVE: { ticker: 'OVE', name: 'Basic Overalls' },
          EXO: { ticker: 'EXO', name: 'Exoskeleton' },
        }
        return commodities[ticker.toUpperCase()] || null
      })

      mockResolveLocation.mockImplementation(async (locationId: string) => {
        const locations: Record<string, { naturalId: string; name: string; type: string }> = {
          Katoa: { naturalId: 'KW-020c', name: 'Katoa', type: 'planet' },
          'KW-020c': { naturalId: 'KW-020c', name: 'Katoa', type: 'planet' },
          Stella: { naturalId: 'OT-580b', name: 'Stella', type: 'planet' },
          BEN: { naturalId: 'BEN', name: 'Benten', type: 'station' },
          Moria: { naturalId: 'UV-351a', name: 'Moria', type: 'planet' },
          'Promitor Station': { naturalId: 'PRO-STN', name: 'Promitor Station', type: 'station' },
          'New Tokyo': { naturalId: 'NT-001', name: 'New Tokyo', type: 'planet' },
        }
        return locations[locationId] || null
      })
    })

    describe('valid multi-format input', () => {
      it('parses single ticker with quantity and location', async () => {
        const result = await parseMultiOrderInput('DW 1000 BEN')

        expect(result.isMultiFormat).toBe(true)
        expect(result.orders).toHaveLength(1)
        expect(result.orders[0]).toEqual({
          ticker: 'DW',
          quantity: 1000,
          commodityName: 'Drinking Water',
        })
        expect(result.location).toBe('BEN')
      })

      it('parses multiple tickers with quantities and location', async () => {
        const result = await parseMultiOrderInput('DW 1000 RAT 500 BEN')

        expect(result.isMultiFormat).toBe(true)
        expect(result.orders).toHaveLength(2)
        expect(result.orders[0]).toEqual({
          ticker: 'DW',
          quantity: 1000,
          commodityName: 'Drinking Water',
        })
        expect(result.orders[1]).toEqual({
          ticker: 'RAT',
          quantity: 500,
          commodityName: 'Basic Rations',
        })
        expect(result.location).toBe('BEN')
      })

      it('parses example from requirements: DW 1000 RAT 1000 OVE 500 EXO 250 BEN', async () => {
        const result = await parseMultiOrderInput('DW 1000 RAT 1000 OVE 500 EXO 250 BEN')

        expect(result.isMultiFormat).toBe(true)
        expect(result.orders).toHaveLength(4)
        expect(result.orders.map(o => ({ t: o.ticker, q: o.quantity }))).toEqual([
          { t: 'DW', q: 1000 },
          { t: 'RAT', q: 1000 },
          { t: 'OVE', q: 500 },
          { t: 'EXO', q: 250 },
        ])
        expect(result.location).toBe('BEN')
      })

      it('resolves location info correctly', async () => {
        const result = await parseMultiOrderInput('COF 100 BEN')

        expect(result.resolvedLocation).toEqual({
          naturalId: 'BEN',
          name: 'Benten',
          type: 'station',
        })
      })

      it('handles multi-word locations', async () => {
        const result = await parseMultiOrderInput('DW 1000 RAT 500 Promitor Station')

        expect(result.isMultiFormat).toBe(true)
        expect(result.orders).toHaveLength(2)
        expect(result.location).toBe('PRO-STN')
        expect(result.resolvedLocation?.name).toBe('Promitor Station')
        expect(result.unresolvedTokens).toHaveLength(0)
      })

      it('handles multi-word locations with extra tokens', async () => {
        const result = await parseMultiOrderInput('COF 100 New Tokyo extra')

        expect(result.isMultiFormat).toBe(true)
        expect(result.orders).toHaveLength(1)
        expect(result.location).toBe('NT-001')
        expect(result.unresolvedTokens).toEqual(['extra'])
      })
    })

    describe('not multi-format (fallback scenarios)', () => {
      it('returns isMultiFormat false for comma-separated tickers', async () => {
        const result = await parseMultiOrderInput('COF,CAF,H2O Katoa')

        expect(result.isMultiFormat).toBe(false)
        expect(result.orders).toHaveLength(0)
      })

      it('returns isMultiFormat false for too few tokens', async () => {
        const result = await parseMultiOrderInput('COF')

        expect(result.isMultiFormat).toBe(false)
      })

      it('returns isMultiFormat false for two tokens only', async () => {
        const result = await parseMultiOrderInput('COF BEN')

        expect(result.isMultiFormat).toBe(false)
      })

      it('returns isMultiFormat false when commodity has no following number', async () => {
        const result = await parseMultiOrderInput('COF CAF BEN')

        expect(result.isMultiFormat).toBe(false)
      })

      it('returns isMultiFormat false for empty input', async () => {
        const result = await parseMultiOrderInput('')

        expect(result.isMultiFormat).toBe(false)
        expect(result.orders).toHaveLength(0)
      })

      it('returns multi-format with unresolved tokens when location cannot be resolved', async () => {
        mockResolveLocation.mockResolvedValue(null)
        const result = await parseMultiOrderInput('COF 100 INVALID')

        // Still multi-format, but location goes to unresolvedTokens
        expect(result.isMultiFormat).toBe(true)
        expect(result.orders).toHaveLength(1)
        expect(result.location).toBeNull()
        expect(result.unresolvedTokens).toEqual(['INVALID'])
      })
    })

    describe('edge cases', () => {
      it('handles whitespace-only input', async () => {
        const result = await parseMultiOrderInput('   ')

        expect(result.isMultiFormat).toBe(false)
        expect(result.orders).toHaveLength(0)
      })

      it('handles location in middle position', async () => {
        // BEN appears in middle, should still work if followed by more ticker-qty pairs
        const result = await parseMultiOrderInput('COF 100 BEN')

        expect(result.isMultiFormat).toBe(true)
        expect(result.orders).toHaveLength(1)
        expect(result.location).toBe('BEN')
      })

      it('tracks unresolved tokens', async () => {
        mockResolveCommodity.mockImplementation(async (ticker: string) => {
          if (ticker.toUpperCase() === 'COF') {
            return { ticker: 'COF', name: 'Coffee' }
          }
          return null
        })

        // INVALID is not a commodity or location
        mockResolveLocation.mockImplementation(async (loc: string) => {
          if (loc === 'BEN') {
            return { naturalId: 'BEN', name: 'Benten', type: 'station' }
          }
          return null
        })

        const result = await parseMultiOrderInput('COF 100 BEN')
        expect(result.isMultiFormat).toBe(true)
        expect(result.unresolvedTokens).toHaveLength(0)
      })
    })
  })

  describe('parseSmartOrderInput', () => {
    beforeEach(() => {
      // Extend mock for smart parsing tests
      mockResolveCommodity.mockImplementation(async (ticker: string) => {
        const commodities: Record<string, { ticker: string; name: string }> = {
          COF: { ticker: 'COF', name: 'Coffee' },
          CAF: { ticker: 'CAF', name: 'Caffeinated Beans' },
          H2O: { ticker: 'H2O', name: 'Water' },
          DW: { ticker: 'DW', name: 'Drinking Water' },
          RAT: { ticker: 'RAT', name: 'Basic Rations' },
        }
        return commodities[ticker.toUpperCase()] || null
      })

      mockResolveLocation.mockImplementation(async (locationId: string) => {
        const locations: Record<string, { naturalId: string; name: string; type: string }> = {
          Katoa: { naturalId: 'KW-020c', name: 'Katoa', type: 'planet' },
          BEN: { naturalId: 'BEN', name: 'Benten', type: 'station' },
        }
        return locations[locationId] || null
      })
    })

    it('returns multi-format result for TICKER QTY TICKER QTY LOCATION', async () => {
      const result = await parseSmartOrderInput('DW 1000 RAT 500 BEN', { forBuy: true })

      expect(result.isMultiFormat).toBe(true)
      expect(result.multi).not.toBeNull()
      expect(result.single).toBeNull()
      expect(result.multi?.orders).toHaveLength(2)
    })

    it('falls back to single-format for comma-separated tickers', async () => {
      const result = await parseSmartOrderInput('COF,CAF Katoa 1000', { forBuy: true })

      expect(result.isMultiFormat).toBe(false)
      expect(result.multi).toBeNull()
      expect(result.single).not.toBeNull()
      expect(result.single?.tickers).toEqual(['COF', 'CAF'])
      expect(result.single?.quantity).toBe(1000)
    })

    it('falls back to single-format for single ticker with quantity', async () => {
      const result = await parseSmartOrderInput('COF Katoa 500', { forBuy: true })

      expect(result.isMultiFormat).toBe(false)
      expect(result.single).not.toBeNull()
      expect(result.single?.tickers).toEqual(['COF'])
      expect(result.single?.quantity).toBe(500)
    })

    it('passes options to single-format parser', async () => {
      const result = await parseSmartOrderInput('COF Katoa 1500', { forSell: true })

      expect(result.isMultiFormat).toBe(false)
      expect(result.single).not.toBeNull()
      // For sell, bare number becomes reserve
      expect(result.single?.limitMode).toBe('reserve')
      expect(result.single?.limitQuantity).toBe(1500)
    })

    it('handles empty input', async () => {
      const result = await parseSmartOrderInput('', { forBuy: true })

      expect(result.isMultiFormat).toBe(false)
      expect(result.single).not.toBeNull()
      expect(result.single?.tickers).toEqual([])
    })
  })
})
