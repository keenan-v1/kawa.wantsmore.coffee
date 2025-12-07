import {
  Body,
  Controller,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Request,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa'
import type { Currency } from '@kawakawa/types'
import { db, priceImportConfigs, fioLocations, fioExchanges, users } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { NotFound, BadRequest } from '../utils/errors.js'
import { AuthenticatedRequest } from '../middleware/auth.js'
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

export type ImportConfigType = 'google_sheets' | 'csv_url'

interface ImportConfigResponse {
  id: number
  name: string
  type: ImportConfigType
  exchangeCode: string
  url: string
  sheetGid: number | null
  fieldMapping: CsvFieldMapping
  locationDefault: string | null
  currencyDefault: Currency | null
  autoSync: boolean
  syncIntervalHours: number
  lastSyncedAt: Date | null
  lastSyncResult: CsvImportResult | null
  createdByUserId: number
  createdByUsername: string | null
  createdAt: Date
  updatedAt: Date
}

interface CreateImportConfigRequest {
  name: string
  type: ImportConfigType
  exchangeCode: string
  url: string
  sheetGid?: number | null
  fieldMapping: CsvFieldMapping
  locationDefault?: string | null
  currencyDefault?: Currency | null
  autoSync?: boolean
  syncIntervalHours?: number
}

interface UpdateImportConfigRequest {
  name?: string
  url?: string
  sheetGid?: number | null
  fieldMapping?: CsvFieldMapping
  locationDefault?: string | null
  currencyDefault?: Currency | null
  autoSync?: boolean
  syncIntervalHours?: number
}

interface GoogleSheetsImportRequest {
  url: string
  exchangeCode: string
  fieldMapping: CsvFieldMapping
  locationDefault?: string | null
  currencyDefault?: Currency | null
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
        id: priceImportConfigs.id,
        name: priceImportConfigs.name,
        type: priceImportConfigs.type,
        exchangeCode: priceImportConfigs.exchangeCode,
        url: priceImportConfigs.url,
        sheetGid: priceImportConfigs.sheetGid,
        fieldMapping: priceImportConfigs.fieldMapping,
        locationDefault: priceImportConfigs.locationDefault,
        currencyDefault: priceImportConfigs.currencyDefault,
        autoSync: priceImportConfigs.autoSync,
        syncIntervalHours: priceImportConfigs.syncIntervalHours,
        lastSyncedAt: priceImportConfigs.lastSyncedAt,
        lastSyncResult: priceImportConfigs.lastSyncResult,
        createdByUserId: priceImportConfigs.createdByUserId,
        createdByUsername: users.username,
        createdAt: priceImportConfigs.createdAt,
        updatedAt: priceImportConfigs.updatedAt,
      })
      .from(priceImportConfigs)
      .leftJoin(users, eq(priceImportConfigs.createdByUserId, users.id))
      .orderBy(priceImportConfigs.name)

    return results.map(r => ({
      ...r,
      fieldMapping: r.fieldMapping as CsvFieldMapping,
      lastSyncResult: r.lastSyncResult as CsvImportResult | null,
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
        id: priceImportConfigs.id,
        name: priceImportConfigs.name,
        type: priceImportConfigs.type,
        exchangeCode: priceImportConfigs.exchangeCode,
        url: priceImportConfigs.url,
        sheetGid: priceImportConfigs.sheetGid,
        fieldMapping: priceImportConfigs.fieldMapping,
        locationDefault: priceImportConfigs.locationDefault,
        currencyDefault: priceImportConfigs.currencyDefault,
        autoSync: priceImportConfigs.autoSync,
        syncIntervalHours: priceImportConfigs.syncIntervalHours,
        lastSyncedAt: priceImportConfigs.lastSyncedAt,
        lastSyncResult: priceImportConfigs.lastSyncResult,
        createdByUserId: priceImportConfigs.createdByUserId,
        createdByUsername: users.username,
        createdAt: priceImportConfigs.createdAt,
        updatedAt: priceImportConfigs.updatedAt,
      })
      .from(priceImportConfigs)
      .leftJoin(users, eq(priceImportConfigs.createdByUserId, users.id))
      .where(eq(priceImportConfigs.id, id))
      .limit(1)

    if (results.length === 0) {
      throw NotFound(`Import configuration with ID ${id} not found`)
    }

    const r = results[0]
    return {
      ...r,
      fieldMapping: r.fieldMapping as CsvFieldMapping,
      lastSyncResult: r.lastSyncResult as CsvImportResult | null,
    }
  }

  /**
   * Create a new import configuration
   * @param request The request with user info
   * @param body The configuration data
   */
  @Post()
  @Security('jwt', ['prices.import'])
  @SuccessResponse('201', 'Created')
  public async createConfig(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateImportConfigRequest
  ): Promise<ImportConfigResponse> {
    // Validate URL for Google Sheets
    if (body.type === 'google_sheets') {
      const parsed = parseGoogleSheetsUrl(body.url)
      if (!parsed) {
        throw BadRequest('Invalid Google Sheets URL')
      }
    }

    // Validate exchange exists
    const exchangeExists = await db
      .select({ code: fioExchanges.code })
      .from(fioExchanges)
      .where(eq(fioExchanges.code, body.exchangeCode.toUpperCase()))
      .limit(1)

    if (exchangeExists.length === 0) {
      throw BadRequest(`Exchange '${body.exchangeCode}' not found`)
    }

    // Validate location default if provided
    if (body.locationDefault) {
      const locationExists = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, body.locationDefault.toUpperCase()))
        .limit(1)

      if (locationExists.length === 0) {
        throw BadRequest(`Location '${body.locationDefault}' not found`)
      }
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

    const [inserted] = await db
      .insert(priceImportConfigs)
      .values({
        name: body.name,
        type: body.type,
        exchangeCode: body.exchangeCode.toUpperCase(),
        url: body.url,
        sheetGid: body.sheetGid ?? null,
        fieldMapping: body.fieldMapping,
        locationDefault: body.locationDefault?.toUpperCase() ?? null,
        currencyDefault: body.currencyDefault ?? null,
        autoSync: body.autoSync ?? false,
        syncIntervalHours: body.syncIntervalHours ?? 24,
        createdByUserId: request.user!.userId,
      })
      .returning({ id: priceImportConfigs.id })

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
      .select({ id: priceImportConfigs.id, type: priceImportConfigs.type })
      .from(priceImportConfigs)
      .where(eq(priceImportConfigs.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Import configuration with ID ${id} not found`)
    }

    // Validate URL if updated
    if (body.url && existing[0].type === 'google_sheets') {
      const parsed = parseGoogleSheetsUrl(body.url)
      if (!parsed) {
        throw BadRequest('Invalid Google Sheets URL')
      }
    }

    // Validate location default if provided
    if (body.locationDefault) {
      const locationExists = await db
        .select({ naturalId: fioLocations.naturalId })
        .from(fioLocations)
        .where(eq(fioLocations.naturalId, body.locationDefault.toUpperCase()))
        .limit(1)

      if (locationExists.length === 0) {
        throw BadRequest(`Location '${body.locationDefault}' not found`)
      }
    }

    // Validate field mapping if provided
    if (body.fieldMapping) {
      if (!body.fieldMapping.ticker || body.fieldMapping.price === undefined) {
        throw BadRequest('fieldMapping must include ticker and price fields')
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) updateData.name = body.name
    if (body.url !== undefined) updateData.url = body.url
    if (body.sheetGid !== undefined) updateData.sheetGid = body.sheetGid
    if (body.fieldMapping !== undefined) updateData.fieldMapping = body.fieldMapping
    if (body.locationDefault !== undefined)
      updateData.locationDefault = body.locationDefault?.toUpperCase() ?? null
    if (body.currencyDefault !== undefined) updateData.currencyDefault = body.currencyDefault
    if (body.autoSync !== undefined) updateData.autoSync = body.autoSync
    if (body.syncIntervalHours !== undefined) updateData.syncIntervalHours = body.syncIntervalHours

    await db.update(priceImportConfigs).set(updateData).where(eq(priceImportConfigs.id, id))

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
      .select({ id: priceImportConfigs.id })
      .from(priceImportConfigs)
      .where(eq(priceImportConfigs.id, id))
      .limit(1)

    if (existing.length === 0) {
      throw NotFound(`Import configuration with ID ${id} not found`)
    }

    await db.delete(priceImportConfigs).where(eq(priceImportConfigs.id, id))
    this.setStatus(204)
  }

  /**
   * Trigger a sync for a saved configuration
   * Fetches the data from the configured source and imports it
   * @param id The configuration ID
   */
  @Post('{id}/sync')
  @Security('jwt', ['prices.import'])
  public async syncConfig(@Path() id: number): Promise<CsvImportResult> {
    // Get the configuration
    const config = await this.getConfig(id)

    // Fetch the data based on type
    let csvContent: string

    if (config.type === 'google_sheets') {
      const parsed = parseGoogleSheetsUrl(config.url)
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
      // For csv_url type, fetch directly
      const response = await fetch(config.url)
      if (!response.ok) {
        throw BadRequest(`Failed to fetch CSV: HTTP ${response.status}`)
      }
      csvContent = await response.text()
    }

    // Import the data
    const result = await importCsvPrices(csvContent, {
      exchangeCode: config.exchangeCode,
      mapping: config.fieldMapping,
      locationDefault: config.locationDefault ?? undefined,
      currencyDefault: config.currencyDefault ?? undefined,
    })

    // Update the last sync info
    await db
      .update(priceImportConfigs)
      .set({
        lastSyncedAt: new Date(),
        lastSyncResult: result,
        updatedAt: new Date(),
      })
      .where(eq(priceImportConfigs.id, id))

    return result
  }

  /**
   * Preview a sync for a saved configuration (without importing)
   * @param id The configuration ID
   */
  @Post('{id}/preview')
  @Security('jwt', ['prices.import'])
  public async previewConfig(@Path() id: number): Promise<CsvPreviewResult> {
    // Get the configuration
    const config = await this.getConfig(id)

    // Fetch the data based on type
    let csvContent: string

    if (config.type === 'google_sheets') {
      const parsed = parseGoogleSheetsUrl(config.url)
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
      // For csv_url type, fetch directly
      const response = await fetch(config.url)
      if (!response.ok) {
        throw BadRequest(`Failed to fetch CSV: HTTP ${response.status}`)
      }
      csvContent = await response.text()
    }

    // Preview the data
    return previewCsvImport(csvContent, {
      exchangeCode: config.exchangeCode,
      mapping: config.fieldMapping,
      locationDefault: config.locationDefault ?? undefined,
      currencyDefault: config.currencyDefault ?? undefined,
    })
  }
}

@Route('prices/import/google-sheets')
@Tags('Pricing')
export class GoogleSheetsImportController extends Controller {
  /**
   * One-time import from Google Sheets (without saving a configuration)
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

    // Validate exchange exists
    const exchangeExists = await db
      .select({ code: fioExchanges.code })
      .from(fioExchanges)
      .where(eq(fioExchanges.code, body.exchangeCode.toUpperCase()))
      .limit(1)

    if (exchangeExists.length === 0) {
      throw BadRequest(`Exchange '${body.exchangeCode}' not found`)
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
      exchangeCode: body.exchangeCode.toUpperCase(),
      mapping: body.fieldMapping,
      locationDefault: body.locationDefault ?? undefined,
      currencyDefault: body.currencyDefault ?? undefined,
    })
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
      exchangeCode: body.exchangeCode.toUpperCase(),
      mapping: body.fieldMapping,
      locationDefault: body.locationDefault ?? undefined,
      currencyDefault: body.currencyDefault ?? undefined,
    })
  }
}
