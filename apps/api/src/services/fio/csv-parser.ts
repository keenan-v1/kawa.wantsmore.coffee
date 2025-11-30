// Simple CSV parser for FIO data
// FIO returns CSV with headers, this utility parses it into objects

export interface CsvParseOptions {
  skipHeader?: boolean
  delimiter?: string
}

/**
 * Parse CSV string into array of objects
 * Assumes first row is header row
 */
export function parseCsv<T = Record<string, string>>(
  csvData: string,
  options: CsvParseOptions = {}
): T[] {
  const { skipHeader = false, delimiter = ',' } = options

  const lines = csvData.trim().split('\n')
  if (lines.length === 0) return []

  const headerLine = lines[0]
  const headers = parseCsvLine(headerLine, delimiter)

  const startIndex = skipHeader ? 0 : 1
  const dataLines = lines.slice(startIndex)

  return dataLines
    .filter(line => line.trim().length > 0)
    .map(line => {
      const values = parseCsvLine(line, delimiter)
      const obj: Record<string, string> = {}

      headers.forEach((header, index) => {
        obj[header] = values[index] ?? ''
      })

      return obj as T
    })
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCsvLine(line: string, delimiter = ','): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      // End of field
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  // Add last field
  result.push(current.trim())

  return result
}

/**
 * Convert CSV string value to appropriate type
 */
export function parseValue(value: string): string | number | boolean | null {
  const trimmed = value.trim()

  // Empty or null
  if (trimmed === '' || trimmed.toLowerCase() === 'null') {
    return null
  }

  // Boolean
  if (trimmed.toLowerCase() === 'true') return true
  if (trimmed.toLowerCase() === 'false') return false

  // Number
  const num = Number(trimmed)
  if (!isNaN(num) && trimmed !== '') {
    return num
  }

  // String (remove surrounding quotes if present)
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }

  return trimmed
}

/**
 * Parse CSV with automatic type conversion
 */
export function parseCsvTyped<T = Record<string, unknown>>(
  csvData: string,
  options: CsvParseOptions = {}
): T[] {
  const rawData = parseCsv(csvData, options)

  return rawData.map(row => {
    const typedRow: Record<string, unknown> = {}

    Object.entries(row).forEach(([key, value]) => {
      typedRow[key] = parseValue(value)
    })

    return typedRow as T
  })
}
