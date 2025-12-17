import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatOrderPrice, calculateTotal, formatPrice } from './priceFormatter.js'

vi.mock('@kawakawa/services/market', () => ({
  getOrderDisplayPrice: vi.fn(),
}))

import { getOrderDisplayPrice } from '@kawakawa/services/market'

describe('priceFormatter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('formatOrderPrice', () => {
    const baseOrder = {
      price: '100.00',
      currency: 'CIS',
      priceListCode: null,
      commodityTicker: 'H2O',
      locationId: 'BEN',
    }

    it('should format order price from price list when available', async () => {
      vi.mocked(getOrderDisplayPrice).mockResolvedValue({
        price: 95.50,
        currency: 'CIS',
      })

      const result = await formatOrderPrice({ ...baseOrder, priceListCode: 'KAWA' })

      expect(result.displayPrice).toBe('95.50')
      expect(result.displayCurrency).toBe('CIS')
      expect(result.numericPrice).toBe(95.50)
    })

    it('should use order price when price list returns null', async () => {
      vi.mocked(getOrderDisplayPrice).mockResolvedValue(null)

      const result = await formatOrderPrice(baseOrder)

      expect(result.displayPrice).toBe('100.00')
      expect(result.displayCurrency).toBe('CIS')
      expect(result.numericPrice).toBe(100)
    })

    it('should handle different currencies', async () => {
      vi.mocked(getOrderDisplayPrice).mockResolvedValue(null)

      const result = await formatOrderPrice({ ...baseOrder, currency: 'NCC' })

      expect(result.displayCurrency).toBe('NCC')
    })
  })

  describe('calculateTotal', () => {
    it('should calculate total value correctly', () => {
      const price = {
        displayPrice: '50.00',
        displayCurrency: 'CIS',
        numericPrice: 50,
      }

      expect(calculateTotal(price, 10)).toBe('500.00')
    })

    it('should handle decimal quantities', () => {
      const price = {
        displayPrice: '33.33',
        displayCurrency: 'CIS',
        numericPrice: 33.33,
      }

      expect(calculateTotal(price, 3)).toBe('99.99')
    })
  })

  describe('formatPrice', () => {
    it('should format number to 2 decimal places', () => {
      expect(formatPrice(100)).toBe('100.00')
      expect(formatPrice(99.999)).toBe('100.00')
      expect(formatPrice(50.5)).toBe('50.50')
    })

    it('should handle string input', () => {
      expect(formatPrice('100')).toBe('100.00')
      expect(formatPrice('50.5')).toBe('50.50')
    })
  })
})
