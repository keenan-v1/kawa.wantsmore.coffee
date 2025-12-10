import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PriceImportController } from './PriceImportController.js'
import * as importService from '../services/csv/import.js'

vi.mock('../services/csv/import.js', () => ({
  previewCsvImport: vi.fn(),
  importCsvPrices: vi.fn(),
}))

describe('PriceImportController', () => {
  let controller: PriceImportController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new PriceImportController()
  })

  describe('previewCsvImport', () => {
    it('should preview CSV file import', async () => {
      const mockFile = {
        buffer: Buffer.from('Ticker,Price\nH2O,100'),
      } as Express.Multer.File

      const mockConfig = JSON.stringify({
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      const mockResult = {
        headers: ['Ticker', 'Price'],
        sampleRows: [],
        parseErrors: [],
        validationErrors: [],
        delimiter: ',',
        totalRows: 1,
        validRows: 1,
      }

      vi.mocked(importService.previewCsvImport).mockResolvedValue(mockResult)

      const result = await controller.previewCsvImport(mockFile, mockConfig)

      expect(result).toEqual(mockResult)
      expect(importService.previewCsvImport).toHaveBeenCalledWith(
        'Ticker,Price\nH2O,100',
        expect.objectContaining({
          exchangeCode: 'KAWA',
          mapping: { ticker: 0, price: 1 },
        }),
        50
      )
    })

    it('should throw BadRequest for invalid config JSON', async () => {
      const mockFile = {
        buffer: Buffer.from('Ticker,Price\nH2O,100'),
      } as Express.Multer.File

      await expect(controller.previewCsvImport(mockFile, 'invalid json')).rejects.toThrow(
        'Invalid config JSON'
      )
    })

    it('should throw BadRequest if exchangeCode is missing', async () => {
      const mockFile = {
        buffer: Buffer.from('Ticker,Price\nH2O,100'),
      } as Express.Multer.File

      const mockConfig = JSON.stringify({
        mapping: { ticker: 0, price: 1 },
      })

      await expect(controller.previewCsvImport(mockFile, mockConfig)).rejects.toThrow(
        'exchangeCode is required'
      )
    })

    it('should throw BadRequest if mapping is missing', async () => {
      const mockFile = {
        buffer: Buffer.from('Ticker,Price\nH2O,100'),
      } as Express.Multer.File

      const mockConfig = JSON.stringify({
        exchangeCode: 'KAWA',
      })

      await expect(controller.previewCsvImport(mockFile, mockConfig)).rejects.toThrow(
        'mapping is required'
      )
    })

    it('should throw BadRequest if mapping.ticker is missing', async () => {
      const mockFile = {
        buffer: Buffer.from('Ticker,Price\nH2O,100'),
      } as Express.Multer.File

      const mockConfig = JSON.stringify({
        exchangeCode: 'KAWA',
        mapping: { price: 1 },
      })

      await expect(controller.previewCsvImport(mockFile, mockConfig)).rejects.toThrow(
        'mapping.ticker is required'
      )
    })
  })

  describe('importCsv', () => {
    it('should import CSV file', async () => {
      const mockFile = {
        buffer: Buffer.from('Ticker,Price\nH2O,100'),
      } as Express.Multer.File

      const mockConfig = JSON.stringify({
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
      })

      const mockResult = {
        imported: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      }

      vi.mocked(importService.importCsvPrices).mockResolvedValue(mockResult)

      const result = await controller.importCsv(mockFile, mockConfig)

      expect(result).toEqual(mockResult)
      expect(importService.importCsvPrices).toHaveBeenCalled()
    })
  })

  describe('importCsvContent', () => {
    it('should import CSV from content', async () => {
      const mockResult = {
        imported: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      }

      vi.mocked(importService.importCsvPrices).mockResolvedValue(mockResult)

      const result = await controller.importCsvContent({
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
        content: 'Ticker,Price\nH2O,100',
      })

      expect(result).toEqual(mockResult)
      expect(importService.importCsvPrices).toHaveBeenCalledWith(
        'Ticker,Price\nH2O,100',
        expect.objectContaining({
          exchangeCode: 'KAWA',
        })
      )
    })

    it('should throw BadRequest if content is missing', async () => {
      await expect(
        controller.importCsvContent({
          exchangeCode: 'KAWA',
          mapping: { ticker: 0, price: 1 },
          content: '',
        })
      ).rejects.toThrow('content is required')
    })
  })

  describe('previewCsvContent', () => {
    it('should preview CSV from content', async () => {
      const mockResult = {
        headers: ['Ticker', 'Price'],
        sampleRows: [],
        parseErrors: [],
        validationErrors: [],
        delimiter: ',',
        totalRows: 1,
        validRows: 1,
      }

      vi.mocked(importService.previewCsvImport).mockResolvedValue(mockResult)

      const result = await controller.previewCsvContent({
        exchangeCode: 'KAWA',
        mapping: { ticker: 0, price: 1 },
        locationDefault: 'BEN',
        currencyDefault: 'CIS',
        content: 'Ticker,Price\nH2O,100',
      })

      expect(result).toEqual(mockResult)
    })
  })
})
