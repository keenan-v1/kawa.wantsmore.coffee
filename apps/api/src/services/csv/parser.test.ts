import { describe, it, expect } from 'vitest'
import { detectDelimiter, parseCsvLine, parsePrice, isValidCurrency, parseCsv } from './parser.js'

describe('CSV Parser', () => {
  describe('detectDelimiter', () => {
    it('should detect comma delimiter', () => {
      expect(detectDelimiter('a,b,c')).toBe(',')
    })

    it('should detect semicolon delimiter', () => {
      expect(detectDelimiter('a;b;c')).toBe(';')
    })

    it('should detect tab delimiter', () => {
      expect(detectDelimiter('a\tb\tc')).toBe('\t')
    })

    it('should detect pipe delimiter', () => {
      expect(detectDelimiter('a|b|c')).toBe('|')
    })

    it('should prefer delimiter with most occurrences', () => {
      expect(detectDelimiter('a,b;c;d;e')).toBe(';')
    })
  })

  describe('parseCsvLine', () => {
    it('should parse simple comma-separated values', () => {
      expect(parseCsvLine('a,b,c', ',')).toEqual(['a', 'b', 'c'])
    })

    it('should handle quoted fields', () => {
      expect(parseCsvLine('"a,b",c,d', ',')).toEqual(['a,b', 'c', 'd'])
    })

    it('should handle escaped quotes', () => {
      expect(parseCsvLine('"a""b",c', ',')).toEqual(['a"b', 'c'])
    })

    it('should trim whitespace', () => {
      expect(parseCsvLine('  a , b , c  ', ',')).toEqual(['a', 'b', 'c'])
    })

    it('should handle empty fields', () => {
      expect(parseCsvLine('a,,c', ',')).toEqual(['a', '', 'c'])
    })
  })

  describe('parsePrice', () => {
    it('should parse simple number', () => {
      expect(parsePrice('100')).toBe(100)
    })

    it('should parse decimal number', () => {
      expect(parsePrice('100.50')).toBe(100.5)
    })

    it('should handle thousand separators', () => {
      expect(parsePrice('1,000.50')).toBe(1000.5)
    })

    it('should handle European format', () => {
      expect(parsePrice('1.000,50')).toBe(1000.5)
    })

    it('should strip currency symbols', () => {
      expect(parsePrice('$100')).toBe(100)
      expect(parsePrice('€50.00')).toBe(50)
    })

    it('should return null for empty string', () => {
      expect(parsePrice('')).toBeNull()
    })

    it('should return null for invalid format', () => {
      expect(parsePrice('abc')).toBeNull()
    })
  })

  describe('isValidCurrency', () => {
    it('should accept valid currencies', () => {
      expect(isValidCurrency('ICA')).toBe(true)
      expect(isValidCurrency('CIS')).toBe(true)
      expect(isValidCurrency('AIC')).toBe(true)
      expect(isValidCurrency('NCC')).toBe(true)
    })

    it('should accept lowercase', () => {
      expect(isValidCurrency('ica')).toBe(true)
    })

    it('should reject invalid currencies', () => {
      expect(isValidCurrency('USD')).toBe(false)
      expect(isValidCurrency('EUR')).toBe(false)
    })
  })

  describe('parseCsv', () => {
    it('should parse CSV with header and column indices', () => {
      const csv = `Ticker,Location,Price,Currency
H2O,BEN,100,CIS
RAT,BEN,50,CIS`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          location: 1,
          price: 2,
          currency: 3,
        },
        exchangeCode: 'KAWA',
      })

      expect(result.headers).toEqual(['Ticker', 'Location', 'Price', 'Currency'])
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0]).toMatchObject({
        rowNumber: 2,
        ticker: 'H2O',
        location: 'BEN',
        price: 100,
        currency: 'CIS',
      })
      expect(result.errors).toHaveLength(0)
    })

    it('should parse CSV with header names', () => {
      const csv = `Commodity,Station,Amount,Curr
H2O,BEN,100,CIS`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 'Commodity',
          location: 'Station',
          price: 'Amount',
          currency: 'Curr',
        },
        exchangeCode: 'KAWA',
      })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].ticker).toBe('H2O')
    })

    it('should use location default when not in CSV', () => {
      const csv = `Ticker,Price
H2O,100`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          price: 1,
        },
        exchangeCode: 'KAWA',
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].location).toBe('BEN')
    })

    it('should use currency default when not in CSV', () => {
      const csv = `Ticker,Price
H2O,100`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          price: 1,
        },
        exchangeCode: 'KAWA',
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].currency).toBe('CIS')
    })

    it('should record errors for missing required fields', () => {
      const csv = `Ticker,Price
,100
H2O,`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          price: 1,
        },
        exchangeCode: 'KAWA',
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.rows).toHaveLength(0)
      expect(result.errors).toHaveLength(2)
      expect(result.errors[0].field).toBe('ticker')
      expect(result.errors[1].field).toBe('price')
    })

    it('should record errors for invalid price', () => {
      const csv = `Ticker,Price
H2O,invalid`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          price: 1,
        },
        exchangeCode: 'KAWA',
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.rows).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].field).toBe('price')
      expect(result.errors[0].message).toBe('Invalid price format')
    })

    it('should record errors for invalid currency', () => {
      const csv = `Ticker,Price,Currency
H2O,100,USD`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          price: 1,
          currency: 2,
        },
        exchangeCode: 'KAWA',
        locationDefault: 'BEN',
      })

      expect(result.rows).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].field).toBe('currency')
    })

    it('should handle CSV without header', () => {
      const csv = `H2O,BEN,100,CIS
RAT,BEN,50,CIS`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          location: 1,
          price: 2,
          currency: 3,
        },
        exchangeCode: 'KAWA',
        hasHeader: false,
      })

      expect(result.headers).toEqual([])
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0].rowNumber).toBe(1)
      expect(result.rows[1].rowNumber).toBe(2)
    })

    it('should auto-detect semicolon delimiter', () => {
      const csv = `Ticker;Price
H2O;100`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          price: 1,
        },
        exchangeCode: 'KAWA',
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.delimiter).toBe(';')
      expect(result.rows).toHaveLength(1)
    })

    it('should convert ticker and location to uppercase', () => {
      const csv = `Ticker,Location,Price
h2o,ben,100`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          location: 1,
          price: 2,
        },
        exchangeCode: 'KAWA',
        currencyDefault: 'CIS',
      })

      expect(result.rows[0].ticker).toBe('H2O') // Tickers are uppercased
      expect(result.rows[0].location).toBe('ben') // Locations preserve case (FIO IDs like UV-351a have lowercase)
    })

    it('should handle empty CSV', () => {
      const result = parseCsv('', {
        mapping: { ticker: 0, price: 1 },
        exchangeCode: 'KAWA',
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      expect(result.rows).toHaveLength(0)
      expect(result.headers).toEqual([])
      expect(result.totalRows).toBe(0)
    })

    it('should preserve raw row data', () => {
      const csv = `Ticker,Location,Price,Notes
H2O,BEN,100,Test note`

      const result = parseCsv(csv, {
        mapping: {
          ticker: 0,
          location: 1,
          price: 2,
        },
        exchangeCode: 'KAWA',
        currencyDefault: 'CIS',
      })

      expect(result.rows[0].raw).toEqual({
        Ticker: 'H2O',
        Location: 'BEN',
        Price: '100',
        Notes: 'Test note',
      })
    })
  })
})
