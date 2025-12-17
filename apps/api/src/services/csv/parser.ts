import type { Currency } from '@kawakawa/types'

/**
 * Field mapping for CSV import
 * Can use header names (string) or column indices (number, 0-based)
 */
export interface CsvFieldMapping {
  ticker: string | number
  location?: string | number // Optional - can use locationDefault
  price: string | number
  currency?: string | number // Optional - can use currencyDefault
}

export interface CsvParseOptions {
  mapping: CsvFieldMapping
  exchangeCode: string // Which exchange to import prices for
  locationDefault?: string // Default location if not in CSV
  currencyDefault?: Currency // Default currency if not in CSV
  delimiter?: string // Default: auto-detect
  hasHeader?: boolean // Default: true
}

export interface ParsedPriceRow {
  rowNumber: number
  ticker: string
  location: string
  price: number
  currency: Currency
  raw: Record<string, string> // Original row data
}

export interface CsvRowError {
  rowNumber: number
  field: string
  value: string
  message: string
}

export interface CsvParseResult {
  headers: string[]
  rows: ParsedPriceRow[]
  errors: CsvRowError[]
  delimiter: string
  totalRows: number
}

/**
 * Auto-detect the delimiter used in CSV content
 */
export function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0] || ''

  // Count occurrences of common delimiters
  const delimiters = [',', ';', '\t', '|']
  let maxCount = 0
  let detected = ','

  for (const d of delimiters) {
    const count = (firstLine.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length
    if (count > maxCount) {
      maxCount = count
      detected = d
    }
  }

  return detected
}

/**
 * Parse a CSV line handling quoted fields
 */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"'
        i++
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  fields.push(current.trim())
  return fields
}

/**
 * Parse a price string handling various formats
 * Examples: "100", "1,000.50", "1.000,50" (European), "$100"
 */
export function parsePrice(value: string): number | null {
  if (!value || value.trim() === '') {
    return null
  }

  // Remove currency symbols and whitespace
  let cleaned = value.replace(/[$€£¥₹]/g, '').trim()

  // Handle European format (1.000,50 -> 1000.50)
  // If there's a comma after a period, it's European format
  if (/\d\.\d{3},\d/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // Standard format - remove thousand separators
    cleaned = cleaned.replace(/,/g, '')
  }

  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/**
 * Validate if a string is a valid currency
 */
export function isValidCurrency(value: string): value is Currency {
  return ['ICA', 'CIS', 'AIC', 'NCC'].includes(value.toUpperCase())
}

/**
 * Get field value from row using mapping (header name or index)
 */
function getFieldValue(
  row: string[],
  headers: string[],
  mapping: string | number | undefined
): string | undefined {
  if (mapping === undefined) {
    return undefined
  }

  if (typeof mapping === 'number') {
    return row[mapping]
  }

  // Find header index
  const index = headers.findIndex(h => h.toLowerCase() === mapping.toLowerCase())
  return index >= 0 ? row[index] : undefined
}

/**
 * Parse CSV content into structured price data
 */
export function parseCsv(content: string, options: CsvParseOptions): CsvParseResult {
  const delimiter = options.delimiter || detectDelimiter(content)
  const hasHeader = options.hasHeader !== false // Default true

  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: [],
      delimiter,
      totalRows: 0,
    }
  }

  // Parse headers
  const headers = hasHeader ? parseCsvLine(lines[0], delimiter) : []
  const dataLines = hasHeader ? lines.slice(1) : lines

  const rows: ParsedPriceRow[] = []
  const errors: CsvRowError[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const rowNumber = hasHeader ? i + 2 : i + 1 // Account for header row
    const fields = parseCsvLine(dataLines[i], delimiter)

    // Build raw data object
    const raw: Record<string, string> = {}
    headers.forEach((h, idx) => {
      raw[h] = fields[idx] || ''
    })

    // Extract ticker
    const tickerValue = getFieldValue(fields, headers, options.mapping.ticker)
    if (!tickerValue || tickerValue.trim() === '') {
      errors.push({
        rowNumber,
        field: 'ticker',
        value: tickerValue || '',
        message: 'Ticker is required',
      })
      continue
    }
    const ticker = tickerValue.toUpperCase().trim()

    // Extract location (or use default)
    // Note: Location IDs are case-sensitive (e.g., "UV-351a"), so we preserve case from defaults
    // but trim whitespace from CSV values
    let location: string
    if (options.mapping.location !== undefined) {
      const locationValue = getFieldValue(fields, headers, options.mapping.location)
      if (!locationValue || locationValue.trim() === '') {
        if (options.locationDefault) {
          location = options.locationDefault // Preserve case from database
        } else {
          errors.push({
            rowNumber,
            field: 'location',
            value: locationValue || '',
            message: 'Location is required (no default provided)',
          })
          continue
        }
      } else {
        location = locationValue.trim() // Preserve case from CSV
      }
    } else if (options.locationDefault) {
      location = options.locationDefault // Preserve case from database
    } else {
      errors.push({
        rowNumber,
        field: 'location',
        value: '',
        message: 'Location mapping or default is required',
      })
      continue
    }

    // Extract price
    const priceValue = getFieldValue(fields, headers, options.mapping.price)
    if (!priceValue || priceValue.trim() === '') {
      errors.push({
        rowNumber,
        field: 'price',
        value: priceValue || '',
        message: 'Price is required',
      })
      continue
    }
    const price = parsePrice(priceValue)
    if (price === null || price < 0) {
      errors.push({
        rowNumber,
        field: 'price',
        value: priceValue,
        message: 'Invalid price format',
      })
      continue
    }

    // Extract currency (or use default)
    let currency: Currency
    if (options.mapping.currency !== undefined) {
      const currencyValue = getFieldValue(fields, headers, options.mapping.currency)
      if (!currencyValue || currencyValue.trim() === '') {
        if (options.currencyDefault) {
          currency = options.currencyDefault
        } else {
          errors.push({
            rowNumber,
            field: 'currency',
            value: currencyValue || '',
            message: 'Currency is required (no default provided)',
          })
          continue
        }
      } else {
        const upperCurrency = currencyValue.toUpperCase().trim()
        if (!isValidCurrency(upperCurrency)) {
          errors.push({
            rowNumber,
            field: 'currency',
            value: currencyValue,
            message: `Invalid currency. Must be one of: ICA, CIS, AIC, NCC`,
          })
          continue
        }
        currency = upperCurrency as Currency
      }
    } else if (options.currencyDefault) {
      currency = options.currencyDefault
    } else {
      errors.push({
        rowNumber,
        field: 'currency',
        value: '',
        message: 'Currency mapping or default is required',
      })
      continue
    }

    rows.push({
      rowNumber,
      ticker,
      location,
      price,
      currency,
      raw,
    })
  }

  return {
    headers,
    rows,
    errors,
    delimiter,
    totalRows: dataLines.length,
  }
}
