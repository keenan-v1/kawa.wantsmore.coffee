import { Body, Controller, Post, Route, Security, Tags, UploadedFile, FormField } from 'tsoa'
import type { Currency } from '@kawakawa/types'
import {
  previewCsvImport,
  importCsvPrices,
  type CsvImportResult,
  type CsvPreviewResult,
} from '../services/csv/import.js'
import type { CsvFieldMapping } from '../services/csv/parser.js'
import { BadRequest } from '../utils/errors.js'

interface CsvImportRequest {
  /** The exchange code to import prices for (KAWA, CI1, etc.) */
  exchangeCode: string
  /** Field mapping configuration */
  mapping: CsvFieldMapping
  /** Default location if not in CSV */
  locationDefault?: string
  /** Default currency if not in CSV */
  currencyDefault?: Currency
  /** CSV delimiter (auto-detected if not provided) */
  delimiter?: string
  /** Whether the CSV has a header row (default: true) */
  hasHeader?: boolean
}

@Route('prices/import')
@Tags('Pricing')
export class PriceImportController extends Controller {
  /**
   * Preview CSV import without committing changes
   * Returns sample rows with validation status
   * @param file The CSV file to preview
   * @param config JSON configuration for the import
   */
  @Post('csv/preview')
  @Security('jwt', ['prices.import'])
  public async previewCsvImport(
    @UploadedFile() file: Express.Multer.File,
    @FormField() config: string
  ): Promise<CsvPreviewResult> {
    // Parse the config JSON
    let parsedConfig: CsvImportRequest
    try {
      parsedConfig = JSON.parse(config)
    } catch {
      throw BadRequest('Invalid config JSON')
    }

    // Validate required fields
    if (!parsedConfig.exchangeCode) {
      throw BadRequest('exchangeCode is required')
    }
    if (!parsedConfig.mapping) {
      throw BadRequest('mapping is required')
    }
    if (parsedConfig.mapping.ticker === undefined) {
      throw BadRequest('mapping.ticker is required')
    }
    if (parsedConfig.mapping.price === undefined) {
      throw BadRequest('mapping.price is required')
    }

    // Read file content
    const content = file.buffer.toString('utf-8')

    // Preview the import
    const result = await previewCsvImport(
      content,
      {
        exchangeCode: parsedConfig.exchangeCode,
        mapping: parsedConfig.mapping,
        locationDefault: parsedConfig.locationDefault,
        currencyDefault: parsedConfig.currencyDefault,
        delimiter: parsedConfig.delimiter,
        hasHeader: parsedConfig.hasHeader,
      },
      50 // Max preview rows
    )

    return result
  }

  /**
   * Import prices from CSV file
   * Creates new prices or updates existing ones
   * @param file The CSV file to import
   * @param config JSON configuration for the import
   */
  @Post('csv')
  @Security('jwt', ['prices.import'])
  public async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @FormField() config: string
  ): Promise<CsvImportResult> {
    // Parse the config JSON
    let parsedConfig: CsvImportRequest
    try {
      parsedConfig = JSON.parse(config)
    } catch {
      throw BadRequest('Invalid config JSON')
    }

    // Validate required fields
    if (!parsedConfig.exchangeCode) {
      throw BadRequest('exchangeCode is required')
    }
    if (!parsedConfig.mapping) {
      throw BadRequest('mapping is required')
    }
    if (parsedConfig.mapping.ticker === undefined) {
      throw BadRequest('mapping.ticker is required')
    }
    if (parsedConfig.mapping.price === undefined) {
      throw BadRequest('mapping.price is required')
    }

    // Read file content
    const content = file.buffer.toString('utf-8')

    // Import the prices
    const result = await importCsvPrices(content, {
      exchangeCode: parsedConfig.exchangeCode,
      mapping: parsedConfig.mapping,
      locationDefault: parsedConfig.locationDefault,
      currencyDefault: parsedConfig.currencyDefault,
      delimiter: parsedConfig.delimiter,
      hasHeader: parsedConfig.hasHeader,
    })

    return result
  }

  /**
   * Import prices from CSV content (JSON body instead of file upload)
   * Useful for testing or when content is already available
   * @param body The import request with CSV content
   */
  @Post('csv/content')
  @Security('jwt', ['prices.import'])
  public async importCsvContent(
    @Body()
    body: CsvImportRequest & { content: string }
  ): Promise<CsvImportResult> {
    // Validate required fields
    if (!body.exchangeCode) {
      throw BadRequest('exchangeCode is required')
    }
    if (!body.mapping) {
      throw BadRequest('mapping is required')
    }
    if (body.mapping.ticker === undefined) {
      throw BadRequest('mapping.ticker is required')
    }
    if (body.mapping.price === undefined) {
      throw BadRequest('mapping.price is required')
    }
    if (!body.content) {
      throw BadRequest('content is required')
    }

    // Import the prices
    const result = await importCsvPrices(body.content, {
      exchangeCode: body.exchangeCode,
      mapping: body.mapping,
      locationDefault: body.locationDefault,
      currencyDefault: body.currencyDefault,
      delimiter: body.delimiter,
      hasHeader: body.hasHeader,
    })

    return result
  }

  /**
   * Preview CSV import from content (JSON body)
   * @param body The preview request with CSV content
   */
  @Post('csv/content/preview')
  @Security('jwt', ['prices.import'])
  public async previewCsvContent(
    @Body()
    body: CsvImportRequest & { content: string }
  ): Promise<CsvPreviewResult> {
    // Validate required fields
    if (!body.exchangeCode) {
      throw BadRequest('exchangeCode is required')
    }
    if (!body.mapping) {
      throw BadRequest('mapping is required')
    }
    if (body.mapping.ticker === undefined) {
      throw BadRequest('mapping.ticker is required')
    }
    if (body.mapping.price === undefined) {
      throw BadRequest('mapping.price is required')
    }
    if (!body.content) {
      throw BadRequest('content is required')
    }

    // Preview the import
    const result = await previewCsvImport(
      body.content,
      {
        exchangeCode: body.exchangeCode,
        mapping: body.mapping,
        locationDefault: body.locationDefault,
        currencyDefault: body.currencyDefault,
        delimiter: body.delimiter,
        hasHeader: body.hasHeader,
      },
      50 // Max preview rows
    )

    return result
  }
}
