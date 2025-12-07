import { db, priceLists, fioCommodities, fioLocations, fioExchanges } from '../../db/index.js'
import { eq, and } from 'drizzle-orm'
import { parseCsv, type CsvParseOptions, type ParsedPriceRow, type CsvRowError } from './parser.js'

export interface CsvImportResult {
  imported: number // New prices created
  updated: number // Existing prices updated
  skipped: number // Rows skipped (validation errors)
  errors: CsvRowError[] // Details of validation failures
}

export interface CsvPreviewResult {
  headers: string[]
  sampleRows: ParsedPriceRow[]
  parseErrors: CsvRowError[]
  validationErrors: CsvRowError[]
  delimiter: string
  totalRows: number
  validRows: number
}

interface ValidatedRow extends ParsedPriceRow {
  commodityExists: boolean
  locationExists: boolean
}

/**
 * Validate that commodities and locations exist in the database
 */
async function validateRows(
  rows: ParsedPriceRow[],
  exchangeCode: string
): Promise<{ validated: ValidatedRow[]; errors: CsvRowError[] }> {
  const errors: CsvRowError[] = []

  // Check which commodities exist
  const existingCommodities = await db
    .select({ ticker: fioCommodities.ticker })
    .from(fioCommodities)

  const commoditySet = new Set(existingCommodities.map(c => c.ticker))

  // Check which locations exist
  const existingLocations = await db
    .select({ naturalId: fioLocations.naturalId })
    .from(fioLocations)

  const locationSet = new Set(existingLocations.map(l => l.naturalId))

  // Check if exchange exists
  const exchange = await db
    .select({ code: fioExchanges.code })
    .from(fioExchanges)
    .where(eq(fioExchanges.code, exchangeCode))
    .limit(1)

  if (exchange.length === 0) {
    // All rows fail if exchange doesn't exist
    for (const row of rows) {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'exchange',
        value: exchangeCode,
        message: `Exchange '${exchangeCode}' not found`,
      })
    }
    return { validated: [], errors }
  }

  // Validate each row
  const validated: ValidatedRow[] = []
  for (const row of rows) {
    const commodityExists = commoditySet.has(row.ticker)
    const locationExists = locationSet.has(row.location)

    if (!commodityExists) {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'ticker',
        value: row.ticker,
        message: `Commodity '${row.ticker}' not found`,
      })
    }

    if (!locationExists) {
      errors.push({
        rowNumber: row.rowNumber,
        field: 'location',
        value: row.location,
        message: `Location '${row.location}' not found`,
      })
    }

    if (commodityExists && locationExists) {
      validated.push({
        ...row,
        commodityExists,
        locationExists,
      })
    }
  }

  return { validated, errors }
}

/**
 * Preview CSV import without committing changes
 * Returns first N rows with validation status
 */
export async function previewCsvImport(
  content: string,
  options: CsvParseOptions,
  maxPreviewRows: number = 50
): Promise<CsvPreviewResult> {
  // Parse the CSV
  const parseResult = parseCsv(content, options)

  // Take first N rows for preview
  const previewRows = parseResult.rows.slice(0, maxPreviewRows)

  // Validate the preview rows
  const { validated, errors: validationErrors } = await validateRows(
    previewRows,
    options.exchangeCode
  )

  return {
    headers: parseResult.headers,
    sampleRows: validated,
    parseErrors: parseResult.errors.slice(0, maxPreviewRows),
    validationErrors,
    delimiter: parseResult.delimiter,
    totalRows: parseResult.totalRows,
    validRows: validated.length,
  }
}

/**
 * Import prices from CSV content
 * Upserts prices (update if exists, insert if new)
 */
export async function importCsvPrices(
  content: string,
  options: CsvParseOptions
): Promise<CsvImportResult> {
  // Parse the CSV
  const parseResult = parseCsv(content, options)

  // Validate all rows
  const { validated, errors: validationErrors } = await validateRows(
    parseResult.rows,
    options.exchangeCode
  )

  const allErrors = [...parseResult.errors, ...validationErrors]

  if (validated.length === 0) {
    return {
      imported: 0,
      updated: 0,
      skipped: parseResult.totalRows,
      errors: allErrors,
    }
  }

  let imported = 0
  let updated = 0

  // Process each validated row
  for (const row of validated) {
    // Check if price already exists
    const existing = await db
      .select({ id: priceLists.id })
      .from(priceLists)
      .where(
        and(
          eq(priceLists.exchangeCode, options.exchangeCode.toUpperCase()),
          eq(priceLists.commodityTicker, row.ticker),
          eq(priceLists.locationId, row.location),
          eq(priceLists.currency, row.currency)
        )
      )
      .limit(1)

    if (existing.length > 0) {
      // Update existing price
      await db
        .update(priceLists)
        .set({
          price: row.price.toFixed(2),
          source: 'csv_import',
          sourceReference: `Row ${row.rowNumber}`,
          updatedAt: new Date(),
        })
        .where(eq(priceLists.id, existing[0].id))
      updated++
    } else {
      // Insert new price
      await db.insert(priceLists).values({
        exchangeCode: options.exchangeCode.toUpperCase(),
        commodityTicker: row.ticker,
        locationId: row.location,
        price: row.price.toFixed(2),
        currency: row.currency,
        source: 'csv_import',
        sourceReference: `Row ${row.rowNumber}`,
      })
      imported++
    }
  }

  return {
    imported,
    updated,
    skipped: parseResult.totalRows - imported - updated,
    errors: allErrors,
  }
}
