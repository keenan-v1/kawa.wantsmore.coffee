import { Body, Controller, Get, Post, Put, Request, Route, Security, Tags } from 'tsoa'
import { AuthenticatedRequest } from '../middleware/auth.js'
import { settingsService } from '../services/settingsService.js'
import { type FioPriceField } from '../services/fio/sync-exchange-prices.js'
import { parseGoogleSheetsUrl, fetchSheetAsCsv } from '../services/google-sheets/client.js'
import { BadRequest } from '../utils/errors.js'
import { importCsvPrices, type CsvImportResult } from '../services/csv/import.js'

// Setting keys for price-related configuration
const SETTING_KEYS = {
  FIO_BASE_URL: 'fio.base_url',
  FIO_PRICE_FIELD: 'fio.price_field',
  GOOGLE_SHEETS_API_KEY: 'google.sheets_api_key',
  KAWA_SHEET_URL: 'kawa.sheet_url',
  KAWA_SHEET_GID: 'kawa.sheet_gid',
} as const

// Default values
const DEFAULTS = {
  [SETTING_KEYS.FIO_BASE_URL]: 'https://rest.fnar.net',
  [SETTING_KEYS.FIO_PRICE_FIELD]: 'PriceAverage',
} as const

interface PriceSettingsResponse {
  fioBaseUrl: string
  fioPriceField: FioPriceField
  hasGoogleSheetsApiKey: boolean
  kawaSheetUrl: string | null
  kawaSheetGid: number | null
}

interface UpdateFioSettingsRequest {
  baseUrl?: string
  priceField?: FioPriceField
}

interface UpdateGoogleSettingsRequest {
  apiKey?: string
}

interface UpdateKawaSheetRequest {
  url?: string
  gid?: number | null
}

@Route('admin/price-settings')
@Tags('Admin')
export class AdminPriceSettingsController extends Controller {
  /**
   * Get current pricing settings
   */
  @Get()
  @Security('jwt', ['admin.manage_users'])
  public async getSettings(): Promise<PriceSettingsResponse> {
    const allSettings = await settingsService.getAll()

    const googleApiKey = allSettings[SETTING_KEYS.GOOGLE_SHEETS_API_KEY]
    const gidValue = allSettings[SETTING_KEYS.KAWA_SHEET_GID]

    return {
      fioBaseUrl: allSettings[SETTING_KEYS.FIO_BASE_URL] || DEFAULTS[SETTING_KEYS.FIO_BASE_URL],
      fioPriceField:
        (allSettings[SETTING_KEYS.FIO_PRICE_FIELD] as FioPriceField) ||
        DEFAULTS[SETTING_KEYS.FIO_PRICE_FIELD],
      hasGoogleSheetsApiKey: !!googleApiKey && googleApiKey.length > 0,
      kawaSheetUrl: allSettings[SETTING_KEYS.KAWA_SHEET_URL] || null,
      kawaSheetGid: gidValue ? parseInt(gidValue, 10) : null,
    }
  }

  /**
   * Update FIO API settings
   */
  @Put('fio')
  @Security('jwt', ['admin.manage_users'])
  public async updateFioSettings(
    @Request() request: AuthenticatedRequest,
    @Body() body: UpdateFioSettingsRequest
  ): Promise<PriceSettingsResponse> {
    const userId = request.user!.userId
    const updates: Record<string, string> = {}

    if (body.baseUrl !== undefined) {
      // Validate URL format
      try {
        new URL(body.baseUrl)
      } catch {
        this.setStatus(400)
        throw new Error('Invalid URL format for FIO base URL')
      }
      updates[SETTING_KEYS.FIO_BASE_URL] = body.baseUrl
    }

    if (body.priceField !== undefined) {
      const validFields: FioPriceField[] = ['PriceAverage', 'MMBuy', 'MMSell', 'Ask', 'Bid']
      if (!validFields.includes(body.priceField)) {
        this.setStatus(400)
        throw new Error('Invalid price field')
      }
      updates[SETTING_KEYS.FIO_PRICE_FIELD] = body.priceField
    }

    if (Object.keys(updates).length > 0) {
      await settingsService.setMany(updates, userId)
    }

    return this.getSettings()
  }

  /**
   * Update Google Sheets API settings
   */
  @Put('google')
  @Security('jwt', ['admin.manage_users'])
  public async updateGoogleSettings(
    @Request() request: AuthenticatedRequest,
    @Body() body: UpdateGoogleSettingsRequest
  ): Promise<PriceSettingsResponse> {
    const userId = request.user!.userId

    if (body.apiKey !== undefined) {
      await settingsService.set(SETTING_KEYS.GOOGLE_SHEETS_API_KEY, body.apiKey, userId)
    }

    return this.getSettings()
  }

  /**
   * Update KAWA price sheet configuration
   */
  @Put('kawa-sheet')
  @Security('jwt', ['admin.manage_users'])
  public async updateKawaSheetSettings(
    @Request() request: AuthenticatedRequest,
    @Body() body: UpdateKawaSheetRequest
  ): Promise<PriceSettingsResponse> {
    const userId = request.user!.userId
    const updates: Record<string, string> = {}

    if (body.url !== undefined) {
      // Validate Google Sheets URL format
      if (body.url && !body.url.includes('docs.google.com/spreadsheets')) {
        this.setStatus(400)
        throw new Error('Invalid Google Sheets URL')
      }
      updates[SETTING_KEYS.KAWA_SHEET_URL] = body.url
    }

    if (body.gid !== undefined) {
      updates[SETTING_KEYS.KAWA_SHEET_GID] = body.gid?.toString() || ''
    }

    if (Object.keys(updates).length > 0) {
      await settingsService.setMany(updates, userId)
    }

    return this.getSettings()
  }

  /**
   * Preview the KAWA sheet data (first 20 rows as CSV)
   * Useful for understanding the sheet structure before syncing
   */
  @Post('kawa-sheet/preview')
  @Security('jwt', ['admin.manage_users'])
  public async previewKawaSheet(): Promise<{ headers: string[]; rows: string[][] }> {
    const allSettings = await settingsService.getAll()
    const sheetUrl = allSettings[SETTING_KEYS.KAWA_SHEET_URL]
    const sheetGid = allSettings[SETTING_KEYS.KAWA_SHEET_GID]

    if (!sheetUrl) {
      throw BadRequest('KAWA sheet URL not configured')
    }

    const parsed = parseGoogleSheetsUrl(sheetUrl)
    if (!parsed) {
      throw BadRequest('Invalid KAWA sheet URL')
    }

    const gid = sheetGid ? parseInt(sheetGid, 10) : parsed.sheetGid
    const result = await fetchSheetAsCsv(parsed.spreadsheetId, gid)

    if (!result.success) {
      throw BadRequest(result.error ?? 'Failed to fetch KAWA sheet')
    }

    // Parse the CSV and return first 20 rows
    const lines = result.content!.split(/\r?\n/).filter(line => line.trim().length > 0)
    const headers = lines[0]?.split(',').map(h => h.trim()) ?? []
    const rows = lines.slice(1, 21).map(line => line.split(',').map(cell => cell.trim()))

    return { headers, rows }
  }

  /**
   * Sync prices from the configured KAWA sheet
   * Expects a standard CSV format with ticker and price columns
   * All prices are imported for the KAWA exchange with a default location
   */
  @Post('kawa-sheet/sync')
  @Security('jwt', ['admin.manage_users'])
  public async syncKawaSheet(@Body() body: KawaSheetSyncRequest): Promise<CsvImportResult> {
    const allSettings = await settingsService.getAll()
    const sheetUrl = allSettings[SETTING_KEYS.KAWA_SHEET_URL]
    const sheetGid = allSettings[SETTING_KEYS.KAWA_SHEET_GID]

    if (!sheetUrl) {
      throw BadRequest('KAWA sheet URL not configured')
    }

    const parsed = parseGoogleSheetsUrl(sheetUrl)
    if (!parsed) {
      throw BadRequest('Invalid KAWA sheet URL')
    }

    const gid = sheetGid ? parseInt(sheetGid, 10) : parsed.sheetGid
    const result = await fetchSheetAsCsv(parsed.spreadsheetId, gid)

    if (!result.success) {
      throw BadRequest(result.error ?? 'Failed to fetch KAWA sheet')
    }

    // Import the CSV with the provided field mapping
    return importCsvPrices(result.content!, {
      exchangeCode: 'KAWA',
      mapping: {
        ticker: body.tickerColumn,
        price: body.priceColumn,
        location: body.locationColumn,
        currency: body.currencyColumn,
      },
      locationDefault: body.locationDefault,
      currencyDefault: body.currencyDefault,
    })
  }
}

interface KawaSheetSyncRequest {
  tickerColumn: string | number
  priceColumn: string | number
  locationColumn?: string | number
  locationDefault?: string
  currencyColumn?: string | number
  currencyDefault?: 'ICA' | 'CIS' | 'AIC' | 'NCC'
}

// Export setting keys for use in other services
export { SETTING_KEYS as PRICE_SETTING_KEYS, DEFAULTS as PRICE_SETTING_DEFAULTS }
