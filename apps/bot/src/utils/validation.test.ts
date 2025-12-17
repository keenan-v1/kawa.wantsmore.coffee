import { describe, it, expect } from 'vitest'
import { isValidCurrency, VALID_CURRENCIES } from './validation.js'

describe('validation', () => {
  describe('VALID_CURRENCIES', () => {
    it('should contain the expected currencies', () => {
      expect(VALID_CURRENCIES).toContain('CIS')
      expect(VALID_CURRENCIES).toContain('ICA')
      expect(VALID_CURRENCIES).toContain('AIC')
      expect(VALID_CURRENCIES).toContain('NCC')
      expect(VALID_CURRENCIES).toHaveLength(4)
    })
  })

  describe('isValidCurrency', () => {
    it('should return true for CIS', () => {
      expect(isValidCurrency('CIS')).toBe(true)
    })

    it('should return true for ICA', () => {
      expect(isValidCurrency('ICA')).toBe(true)
    })

    it('should return true for AIC', () => {
      expect(isValidCurrency('AIC')).toBe(true)
    })

    it('should return true for NCC', () => {
      expect(isValidCurrency('NCC')).toBe(true)
    })

    it('should return false for invalid currencies', () => {
      expect(isValidCurrency('USD')).toBe(false)
      expect(isValidCurrency('EUR')).toBe(false)
      expect(isValidCurrency('INVALID')).toBe(false)
    })

    it('should return false for lowercase valid currencies', () => {
      expect(isValidCurrency('cis')).toBe(false)
      expect(isValidCurrency('ica')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isValidCurrency('')).toBe(false)
    })

    it('should return false for mixed case', () => {
      expect(isValidCurrency('Cis')).toBe(false)
      expect(isValidCurrency('cIS')).toBe(false)
    })
  })
})
