import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import { db, importConfigs, priceLists, fioLocations, fioCommodities, prices } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import { NotFound, BadRequest } from '../utils/errors.js'
import {
  parseGoogleSheetsUrl,
  fetchSheetAsCsv,
  fetchSheetByUrl,
} from '../services/google-sheets/client.js'
import {
  importCsvPrices,
  previewCsvImport,
  type CsvImportResult,
  type CsvPreviewResult,
} from '../services/csv/import.js'
import type { CsvFieldMapping } from '../services/csv/parser.js'

export type ImportSourceType = 'csv' | 'google_sheets'
export type ImportFormat = 'flat' | 'pivot'

interface ImportConfigResponse {
  id: number
  priceListCode: string
  name: string
  sourceType: ImportSourceType
  format: ImportFormat
  sheetsUrl: string | null
  sheetGid: number | null
  config: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  // Backwards compatibility
  exchangeCode: string
}

interface CreateImportConfigRequest {
  priceListCode: string
  name: string
  sourceType: ImportSourceType
  format: ImportFormat
  sheetsUrl?: string | null
  sheetGid?: number | null
  config?: Record<string, unknown> | null
}

interface UpdateImportConfigRequest {
  name?: string
  sheetsUrl?: string | null
  sheetGid?: number | null
  config?: Record<string, unknown> | null
}

interface GoogleSheetsImportRequest {
  url: string
  priceListCode: string
  fieldMapping: CsvFieldMapping
}

interface PivotImportRequest {
  url: string
  priceListCode: string
}

interface PivotImportResult {
  imported: number
  updated: number
  skipped: number
  errors: string[]
}

@Route('prices/import/configs')
@Tags('Pricing')
export class ImportConfigsController extends Controller {
  /**
   * List all saved import configurations
   */
  @Get()
  @Security('jwt', ['prices.view'])
  public async getConfigs(): Promise<ImportConfigResponse[]> {
    const results = await db
      .select({
        id: importConfigs.id,
        priceListCode: importConfigs.priceListCode,
        name: importConfigs.name,
        sourceType: importConfigs.sourceType,
        format: importConfigs.format,
        sheetsUrl: importConfigs.sheetsUrl,
        sheetGid: importConfigs.sheetGid,
        config: importConfigs.config,
        createdAt: importConfigs.createdAt,
        updatedAt: importConfigs.updatedAt,
      })
      .from(importConfigs)
      .orderBy(importConfigs.name)

    return results.map(r => ({
      ...r,
      config: r.config as Record<string, unknown> | null,
      exchangeCode: r.priceListCode,
    }))
  }

  /**
   * Get a specific import configuration
   * @param id The configuration ID
   */
  @Get('{id}')
  @Security('jwt', ['prices.view'])
  public async getConfig(@Path() id: number): Promise<ImportConfigResponse> {
    const results = await db
      .select({
        id: importConfigs.id,
        priceListCode: importConfigs.priceListCode,
        name: importConfigs.name,
        sourceType: importConfigs.sourceType,
        format: importConfigs.format,
        sheetsUrl: importConfigs.sheetsUrl,
        sheetGid: importConfigs.sheetGid,
        config: importConfigs.config,
        createdAt: importConfigs.createdAt,
        updatedAt: importConfigs.updatedAt,
      })
      .from(importConfigs)
      .where(eq(importConfigs.id, id))
      .limit(1)

    if (results.length === 0) {
      throw NotFound(`Import configuration with ID ${id} not found`)
    }

    const r = results[0]
    return {
      ...r,
      config: r.config as Record<string, unknown> | null,
      exchangeCode: r.priceListCode,
    }
  }

  /**
   * Create a new import configuration
   * @param body The configuration data
   */
  @Post()
  @Security('jwt', ['prices.import'])
  @SuccessResponse('201', 'Created')
  public async createConfig(
    @Body() body: CreateImportConfigRequest
  ): Promise<ImportConfigResponse> {
    const priceListCode = body.priceListCode.toUpperCase()

    // Validate URL for Google Sheets
    if (body.sourceType === 'google_sheets' && body.sheetsUrl) {
      const parsed = parseGoogleSheetsUrl(body.sheetsUrl)
      if (!parsed) {
        throw BadRequest('Invalid Google Sheets URL')
      }
    }

    // Validate price list exists
    const priceListExists = await db
      .select({ code: priceLists.code })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceListExists.length === 0) {
      throw BadRequest(`Price list '${priceListCode}' not found`)
    }

    const [inserted] = await db
      .insert(importConfigs)
      .values({
        priceListCode,
        name: body.name,
        sourceType: body.sourceType,
        format: body.format,
        sheetsUrl: body.sheetsUrl ?? null,
        sheetGid: body.sheetGid ?? null,
        config: body.config ?? null,
      })
      .returning({ id: importConfigs.id })

    this.setStatus(201)
    return this.getConfig(inserted.id)
  }

  /**
   * Update an existing import configuration
   * @param id The configuration ID
   * @param body The fields to update
   */
  @Put('{id}')
  @Security('jwt', ['prices.import'])
  public async updateConfig(
    @Path() id: number,
    @Body() body: UpdateImportConfigRequest
  ): Promise<ImportConfigResponse> {
    // Check if config exists
    const existing = await db
      .select({ id: importConfigs.id, sourceType: importConfigs.sourceType })
      .from(importConfigs)
      .where(eq(importConfigs.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Import configuration with ID ${id} not found`)
    }

    // Validate URL if updated
    if (body.sheetsUrl && existing[0].sourceType === 'google_sheets') {
      const parsed = parseGoogleSheetsUrl(body.sheetsUrl)
      if (!parsed) {
        throw BadRequest('Invalid Google Sheets URL')
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) updateData.name = body.name
    if (body.sheetsUrl !== undefined) updateData.sheetsUrl = body.sheetsUrl
    if (body.sheetGid !== undefined) updateData.sheetGid = body.sheetGid
    if (body.config !== undefined) updateData.config = body.config

    await db.update(importConfigs).set(updateData).where(eq(importConfigs.id, id))

    return this.getConfig(id)
  }

  /**
   * Delete an import configuration
   * @param id The configuration ID
   */
  @Delete('{id}')
  @Security('jwt', ['prices.import'])
  @SuccessResponse('204', 'Deleted')
  public async deleteConfig(@Path() id: number): Promise<void> {
    const existing = await db
      .select({ id: importConfigs.id })
      .from(importConfigs)
      .where(eq(importConfigs.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Import configuration with ID ${id} not found`)
    }

    await db.delete(importConfigs).where(eq(importConfigs.id, id))
    this.setStatus(204)
  }

  /**
   * Trigger a sync for a saved configuration
   * Fetches the data from the configured source and imports it
   * @param id The configuration ID
   */
  @Post('{id}/sync')
  @Security('jwt', ['prices.import'])
  public async syncConfig(@Path() id: number): Promise<CsvImportResult | PivotImportResult> {
    // Get the configuration
    const config = await this.getConfig(id)

    // Validate required fields for sync
    if (config.sourceType === 'google_sheets' && !config.sheetsUrl) {
      throw BadRequest('Google Sheets URL is required for sync')
    }

    // For pivot format, use pivot import
    if (config.format === 'pivot') {
      return this.syncPivotConfig(config)
    }

    // For flat format, use standard CSV import
    return this.syncFlatConfig(config)
  }

  private async syncFlatConfig(config: ImportConfigResponse): Promise<CsvImportResult> {
    let csvContent: string

    if (config.sourceType === 'google_sheets') {
      const parsed = parseGoogleSheetsUrl(config.sheetsUrl!)
      if (!parsed) {
        throw BadRequest('Invalid Google Sheets URL in configuration')
      }

      const fetchResult = await fetchSheetAsCsv(
        parsed.spreadsheetId,
        config.sheetGid ?? parsed.sheetGid
      )

      if (!fetchResult.success) {
        throw BadRequest(fetchResult.error ?? 'Failed to fetch Google Sheet')
      }

      csvContent = fetchResult.content!
    } else {
      throw BadRequest('CSV import not yet implemented for non-sheets sources')
    }

    // Get field mapping from config, or use auto-detection
    const fieldMapping = (config.config?.fieldMapping as CsvFieldMapping) ?? {
      ticker: 'Ticker',
      price: 'Price',
      location: 'Location',
    }

    // Import the data
    return importCsvPrices(csvContent, {
      exchangeCode: config.priceListCode,
      mapping: fieldMapping,
    })
  }

  private async syncPivotConfig(config: ImportConfigResponse): Promise<PivotImportResult> {
    if (config.sourceType !== 'google_sheets' || !config.sheetsUrl) {
      throw BadRequest('Pivot format requires Google Sheets source with URL')
    }

    const parsed = parseGoogleSheetsUrl(config.sheetsUrl)
    if (!parsed) {
      throw BadRequest('Invalid Google Sheets URL in configuration')
    }

    const fetchResult = await fetchSheetAsCsv(
      parsed.spreadsheetId,
      config.sheetGid ?? parsed.sheetGid
    )

    if (!fetchResult.success) {
      throw BadRequest(fetchResult.error ?? 'Failed to fetch Google Sheet')
    }

    // Parse pivot format
    const lines = fetchResult.content!.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      throw BadRequest('Sheet must have at least a header row and one data row')
    }

    // Parse header to find location columns
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

    // Get ticker column index (look for "Ticker" or first column)
    const tickerColIndex = headers.findIndex(
      h => h.toLowerCase() === 'ticker' || h.toLowerCase() === 'material'
    )
    if (tickerColIndex === -1) {
      throw BadRequest('Could not find Ticker column in sheet')
    }

    // Get all known locations
    const locations = await db
      .select({ naturalId: fioLocations.naturalId, name: fioLocations.name })
      .from(fioLocations)

    const locationByName = new Map(locations.map(l => [l.name.toLowerCase(), l.naturalId]))
    const locationByNaturalId = new Map(
      locations.map(l => [l.naturalId.toLowerCase(), l.naturalId])
    )

    // Map header columns to locations
    const columnLocations: Array<{ index: number; locationId: string }> = []
    for (let i = 0; i < headers.length; i++) {
      if (i === tickerColIndex) continue
      const header = headers[i].toLowerCase()
      const locationId = locationByName.get(header) ?? locationByNaturalId.get(header)
      if (locationId) {
        columnLocations.push({ index: i, locationId })
      }
    }

    if (columnLocations.length === 0) {
      throw BadRequest('No location columns found in sheet headers')
    }

    // Get all known commodities
    const commodities = await db.select({ ticker: fioCommodities.ticker }).from(fioCommodities)
    const validTickers = new Set(commodities.map(c => c.ticker.toUpperCase()))

    // Parse data rows
    const priceRecords: Array<{ ticker: string; locationId: string; price: number }> = []
    const errors: string[] = []

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const cells = lines[rowIdx].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const ticker = cells[tickerColIndex]?.toUpperCase()

      if (!ticker || !validTickers.has(ticker)) {
        if (ticker) {
          errors.push(`Row ${rowIdx + 1}: Unknown ticker "${ticker}"`)
        }
        continue
      }

      for (const { index, locationId } of columnLocations) {
        const priceStr = cells[index]?.trim()
        if (!priceStr || priceStr === '-' || priceStr === '') continue

        const price = parseFloat(priceStr.replace(/,/g, ''))
        if (isNaN(price) || price <= 0) {
          errors.push(`Row ${rowIdx + 1}, ${headers[index]}: Invalid price "${priceStr}"`)
          continue
        }

        priceRecords.push({ ticker, locationId, price })
      }
    }

    // Actually import the prices to the database
    const priceListCode = config.priceListCode
    let imported = 0
    let updated = 0

    for (const record of priceRecords) {
      // Check if price already exists
      const existing = await db
        .select({ id: prices.id })
        .from(prices)
        .where(
          and(
            eq(prices.priceListCode, priceListCode),
            eq(prices.commodityTicker, record.ticker),
            eq(prices.locationId, record.locationId)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        // Update existing price
        await db
          .update(prices)
          .set({
            price: record.price.toFixed(2),
            source: 'google_sheets',
            sourceReference: config.sheetsUrl ?? 'Pivot import',
            updatedAt: new Date(),
          })
          .where(eq(prices.id, existing[0].id))
        updated++
      } else {
        // Insert new price
        await db.insert(prices).values({
          priceListCode,
          commodityTicker: record.ticker,
          locationId: record.locationId,
          price: record.price.toFixed(2),
          source: 'google_sheets',
          sourceReference: config.sheetsUrl ?? 'Pivot import',
        })
        imported++
      }
    }

    return {
      imported,
      updated,
      skipped: errors.length,
      errors,
    }
  }

  /**
   * Preview a pivot config (parse data without importing)
   */
  private async previewPivotConfig(config: ImportConfigResponse): Promise<PivotImportResult> {
    if (config.sourceType !== 'google_sheets' || !config.sheetsUrl) {
      throw BadRequest('Pivot format requires Google Sheets source with URL')
    }

    const parsed = parseGoogleSheetsUrl(config.sheetsUrl)
    if (!parsed) {
      throw BadRequest('Invalid Google Sheets URL in configuration')
    }

    const fetchResult = await fetchSheetAsCsv(
      parsed.spreadsheetId,
      config.sheetGid ?? parsed.sheetGid
    )

    if (!fetchResult.success) {
      throw BadRequest(fetchResult.error ?? 'Failed to fetch Google Sheet')
    }

    // Parse pivot format
    const lines = fetchResult.content!.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      throw BadRequest('Sheet must have at least a header row and one data row')
    }

    // Parse header to find location columns
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

    // Get ticker column index
    const tickerColIndex = headers.findIndex(
      h => h.toLowerCase() === 'ticker' || h.toLowerCase() === 'material'
    )
    if (tickerColIndex === -1) {
      throw BadRequest('Could not find Ticker column in sheet')
    }

    // Get all known locations
    const locations = await db
      .select({ naturalId: fioLocations.naturalId, name: fioLocations.name })
      .from(fioLocations)

    const locationByName = new Map(locations.map(l => [l.name.toLowerCase(), l.naturalId]))
    const locationByNaturalId = new Map(
      locations.map(l => [l.naturalId.toLowerCase(), l.naturalId])
    )

    // Map header columns to locations
    const columnLocations: Array<{ index: number; locationId: string }> = []
    for (let i = 0; i < headers.length; i++) {
      if (i === tickerColIndex) continue
      const header = headers[i].toLowerCase()
      const locationId = locationByName.get(header) ?? locationByNaturalId.get(header)
      if (locationId) {
        columnLocations.push({ index: i, locationId })
      }
    }

    if (columnLocations.length === 0) {
      throw BadRequest('No location columns found in sheet headers')
    }

    // Get all known commodities
    const commodities = await db.select({ ticker: fioCommodities.ticker }).from(fioCommodities)
    const validTickers = new Set(commodities.map(c => c.ticker.toUpperCase()))

    // Parse data rows (count only, don't import)
    let validCount = 0
    const errors: string[] = []

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const cells = lines[rowIdx].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const ticker = cells[tickerColIndex]?.toUpperCase()

      if (!ticker || !validTickers.has(ticker)) {
        if (ticker) {
          errors.push(`Row ${rowIdx + 1}: Unknown ticker "${ticker}"`)
        }
        continue
      }

      for (const { index } of columnLocations) {
        const priceStr = cells[index]?.trim()
        if (!priceStr || priceStr === '-' || priceStr === '') continue

        const price = parseFloat(priceStr.replace(/,/g, ''))
        if (isNaN(price) || price <= 0) {
          errors.push(`Row ${rowIdx + 1}, ${headers[index]}: Invalid price "${priceStr}"`)
          continue
        }

        validCount++
      }
    }

    return {
      imported: validCount, // For preview, this is the count that WOULD be imported
      updated: 0, // Can't know without checking DB
      skipped: errors.length,
      errors,
    }
  }

  /**
   * Preview a sync for a saved configuration (without importing)
   * @param id The configuration ID
   */
  @Post('{id}/preview')
  @Security('jwt', ['prices.import'])
  public async previewConfig(@Path() id: number): Promise<CsvPreviewResult | PivotImportResult> {
    // Get the configuration
    const config = await this.getConfig(id)

    if (config.format === 'pivot') {
      // Use preview method that doesn't write to database
      return this.previewPivotConfig(config)
    }

    // For flat format
    let csvContent: string

    if (config.sourceType === 'google_sheets') {
      const parsed = parseGoogleSheetsUrl(config.sheetsUrl!)
      if (!parsed) {
        throw BadRequest('Invalid Google Sheets URL in configuration')
      }

      const fetchResult = await fetchSheetAsCsv(
        parsed.spreadsheetId,
        config.sheetGid ?? parsed.sheetGid
      )

      if (!fetchResult.success) {
        throw BadRequest(fetchResult.error ?? 'Failed to fetch Google Sheet')
      }

      csvContent = fetchResult.content!
    } else {
      throw BadRequest('Preview not yet implemented for non-sheets sources')
    }

    const fieldMapping = (config.config?.fieldMapping as CsvFieldMapping) ?? {
      ticker: 'Ticker',
      price: 'Price',
      location: 'Location',
    }

    // Preview the data
    return previewCsvImport(csvContent, {
      exchangeCode: config.priceListCode,
      mapping: fieldMapping,
    })
  }
}

@Route('prices/import/google-sheets')
@Tags('Pricing')
export class GoogleSheetsImportController extends Controller {
  /**
   * One-time import from Google Sheets (flat format, without saving a configuration)
   * @param body The import parameters
   */
  @Post()
  @Security('jwt', ['prices.import'])
  public async importFromGoogleSheets(
    @Body() body: GoogleSheetsImportRequest
  ): Promise<CsvImportResult> {
    // Validate URL
    const parsed = parseGoogleSheetsUrl(body.url)
    if (!parsed) {
      throw BadRequest('Invalid Google Sheets URL')
    }

    const priceListCode = body.priceListCode.toUpperCase()

    // Validate price list exists
    const priceListExists = await db
      .select({ code: priceLists.code })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceListExists.length === 0) {
      throw BadRequest(`Price list '${priceListCode}' not found`)
    }

    // Validate field mapping (ticker and price can be 0, so check for undefined/null/empty)
    const ticker = body.fieldMapping.ticker
    const price = body.fieldMapping.price
    if (
      ticker === undefined ||
      ticker === null ||
      ticker === '' ||
      price === undefined ||
      price === null ||
      price === ''
    ) {
      throw BadRequest('fieldMapping must include ticker and price fields')
    }

    // Fetch the sheet
    const fetchResult = await fetchSheetAsCsv(parsed.spreadsheetId, parsed.sheetGid)

    if (!fetchResult.success) {
      throw BadRequest(fetchResult.error ?? 'Failed to fetch Google Sheet')
    }

    // Import the data
    return importCsvPrices(fetchResult.content!, {
      exchangeCode: priceListCode,
      mapping: body.fieldMapping,
    })
  }

  /**
   * One-time import from Google Sheets (pivot format)
   * @param body The import parameters
   */
  @Post('pivot')
  @Security('jwt', ['prices.import'])
  public async importPivotFromGoogleSheets(
    @Body() body: PivotImportRequest
  ): Promise<PivotImportResult> {
    // Validate URL
    const parsed = parseGoogleSheetsUrl(body.url)
    if (!parsed) {
      throw BadRequest('Invalid Google Sheets URL')
    }

    const priceListCode = body.priceListCode.toUpperCase()

    // Validate price list exists
    const priceListExists = await db
      .select({ code: priceLists.code })
      .from(priceLists)
      .where(eq(priceLists.code, priceListCode))
      .limit(1)

    if (priceListExists.length === 0) {
      throw BadRequest(`Price list '${priceListCode}' not found`)
    }

    // Fetch the sheet
    const fetchResult = await fetchSheetAsCsv(parsed.spreadsheetId, parsed.sheetGid)

    if (!fetchResult.success) {
      throw BadRequest(fetchResult.error ?? 'Failed to fetch Google Sheet')
    }

    // Parse pivot format (same logic as syncPivotConfig)
    const lines = fetchResult.content!.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      throw BadRequest('Sheet must have at least a header row and one data row')
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

    const tickerColIndex = headers.findIndex(
      h => h.toLowerCase() === 'ticker' || h.toLowerCase() === 'material'
    )
    if (tickerColIndex === -1) {
      throw BadRequest('Could not find Ticker column in sheet')
    }

    const locations = await db
      .select({ naturalId: fioLocations.naturalId, name: fioLocations.name })
      .from(fioLocations)

    const locationByName = new Map(locations.map(l => [l.name.toLowerCase(), l.naturalId]))
    const locationByNaturalId = new Map(
      locations.map(l => [l.naturalId.toLowerCase(), l.naturalId])
    )

    const columnLocations: Array<{ index: number; locationId: string }> = []
    for (let i = 0; i < headers.length; i++) {
      if (i === tickerColIndex) continue
      const header = headers[i].toLowerCase()
      const locationId = locationByName.get(header) ?? locationByNaturalId.get(header)
      if (locationId) {
        columnLocations.push({ index: i, locationId })
      }
    }

    if (columnLocations.length === 0) {
      throw BadRequest('No location columns found in sheet headers')
    }

    const commodities = await db.select({ ticker: fioCommodities.ticker }).from(fioCommodities)
    const validTickers = new Set(commodities.map(c => c.ticker.toUpperCase()))

    const priceRecords: Array<{ ticker: string; locationId: string; price: number }> = []
    const errors: string[] = []

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const cells = lines[rowIdx].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const ticker = cells[tickerColIndex]?.toUpperCase()

      if (!ticker || !validTickers.has(ticker)) {
        if (ticker) {
          errors.push(`Row ${rowIdx + 1}: Unknown ticker "${ticker}"`)
        }
        continue
      }

      for (const { index, locationId } of columnLocations) {
        const priceStr = cells[index]?.trim()
        if (!priceStr || priceStr === '-' || priceStr === '') continue

        const price = parseFloat(priceStr.replace(/,/g, ''))
        if (isNaN(price) || price <= 0) {
          errors.push(`Row ${rowIdx + 1}, ${headers[index]}: Invalid price "${priceStr}"`)
          continue
        }

        priceRecords.push({ ticker, locationId, price })
      }
    }

    // Actually import the prices to the database
    let imported = 0
    let updated = 0

    for (const record of priceRecords) {
      // Check if price already exists
      const existing = await db
        .select({ id: prices.id })
        .from(prices)
        .where(
          and(
            eq(prices.priceListCode, priceListCode),
            eq(prices.commodityTicker, record.ticker),
            eq(prices.locationId, record.locationId)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        // Update existing price
        await db
          .update(prices)
          .set({
            price: record.price.toFixed(2),
            source: 'google_sheets',
            sourceReference: body.url,
            updatedAt: new Date(),
          })
          .where(eq(prices.id, existing[0].id))
        updated++
      } else {
        // Insert new price
        await db.insert(prices).values({
          priceListCode,
          commodityTicker: record.ticker,
          locationId: record.locationId,
          price: record.price.toFixed(2),
          source: 'google_sheets',
          sourceReference: body.url,
        })
        imported++
      }
    }

    return {
      imported,
      updated,
      skipped: errors.length,
      errors,
    }
  }

  /**
   * Preview import from Google Sheets (without importing)
   * @param body The import parameters
   */
  @Post('preview')
  @Security('jwt', ['prices.import'])
  public async previewGoogleSheetsImport(
    @Body() body: GoogleSheetsImportRequest
  ): Promise<CsvPreviewResult> {
    // Validate URL
    const fetchResult = await fetchSheetByUrl(body.url)

    if (!fetchResult.success) {
      throw BadRequest(fetchResult.error ?? 'Failed to fetch Google Sheet')
    }

    // Validate field mapping (ticker and price can be 0, so check for undefined/null/empty)
    const ticker = body.fieldMapping.ticker
    const price = body.fieldMapping.price
    if (
      ticker === undefined ||
      ticker === null ||
      ticker === '' ||
      price === undefined ||
      price === null ||
      price === ''
    ) {
      throw BadRequest('fieldMapping must include ticker and price fields')
    }

    // Preview the data
    return previewCsvImport(fetchResult.content!, {
      exchangeCode: body.priceListCode.toUpperCase(),
      mapping: body.fieldMapping,
    })
  }
}
