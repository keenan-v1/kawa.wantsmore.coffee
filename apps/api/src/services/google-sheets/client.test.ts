import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseGoogleSheetsUrl,
  buildCsvExportUrl,
  fetchSheetAsCsv,
  fetchSheetByUrl,
} from './client.js'

describe('Google Sheets Client', () => {
  describe('parseGoogleSheetsUrl', () => {
    it('should parse URL with hash gid', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit#gid=456'
      const result = parseGoogleSheetsUrl(url)
      expect(result).toEqual({
        spreadsheetId: '1ABC123xyz',
        sheetGid: 456,
      })
    })

    it('should parse URL with query param gid', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit?gid=789'
      const result = parseGoogleSheetsUrl(url)
      expect(result).toEqual({
        spreadsheetId: '1ABC123xyz',
        sheetGid: 789,
      })
    })

    it('should parse URL without gid', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit'
      const result = parseGoogleSheetsUrl(url)
      expect(result).toEqual({
        spreadsheetId: '1ABC123xyz',
        sheetGid: undefined,
      })
    })

    it('should parse URL with trailing slash', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/'
      const result = parseGoogleSheetsUrl(url)
      expect(result).toEqual({
        spreadsheetId: '1ABC123xyz',
        sheetGid: undefined,
      })
    })

    it('should parse minimal URL', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz'
      const result = parseGoogleSheetsUrl(url)
      expect(result).toEqual({
        spreadsheetId: '1ABC123xyz',
        sheetGid: undefined,
      })
    })

    it('should handle URL with both hash and query gid (hash takes precedence)', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit?gid=111#gid=222'
      const result = parseGoogleSheetsUrl(url)
      expect(result).toEqual({
        spreadsheetId: '1ABC123xyz',
        sheetGid: 222, // Hash takes precedence
      })
    })

    it('should return null for non-Google URLs', () => {
      expect(parseGoogleSheetsUrl('https://example.com/spreadsheets/d/123')).toBeNull()
    })

    it('should return null for Google Docs (not Sheets)', () => {
      expect(parseGoogleSheetsUrl('https://docs.google.com/document/d/123')).toBeNull()
    })

    it('should return null for invalid URLs', () => {
      expect(parseGoogleSheetsUrl('not-a-url')).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(parseGoogleSheetsUrl('')).toBeNull()
    })

    it('should handle spreadsheet IDs with hyphens and underscores', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1ABC-123_xyz/edit'
      const result = parseGoogleSheetsUrl(url)
      expect(result).toEqual({
        spreadsheetId: '1ABC-123_xyz',
        sheetGid: undefined,
      })
    })
  })

  describe('buildCsvExportUrl', () => {
    it('should build URL without gid', () => {
      const url = buildCsvExportUrl('1ABC123xyz')
      expect(url).toBe('https://docs.google.com/spreadsheets/d/1ABC123xyz/export?format=csv')
    })

    it('should build URL with gid', () => {
      const url = buildCsvExportUrl('1ABC123xyz', 456)
      expect(url).toBe(
        'https://docs.google.com/spreadsheets/d/1ABC123xyz/export?format=csv&gid=456'
      )
    })

    it('should build URL with gid=0', () => {
      const url = buildCsvExportUrl('1ABC123xyz', 0)
      expect(url).toBe('https://docs.google.com/spreadsheets/d/1ABC123xyz/export?format=csv&gid=0')
    })
  })

  describe('fetchSheetAsCsv', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('should fetch CSV content successfully', async () => {
      const mockCsvContent = 'Ticker,Price\nH2O,100\nRAT,50'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/csv' }),
        text: () => Promise.resolve(mockCsvContent),
      })

      const result = await fetchSheetAsCsv('1ABC123xyz')

      expect(result.success).toBe(true)
      expect(result.content).toBe(mockCsvContent)
      expect(result.error).toBeUndefined()
    })

    it('should return error for 401 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      })

      const result = await fetchSheetAsCsv('1ABC123xyz')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not publicly accessible')
    })

    it('should return error for 403 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      })

      const result = await fetchSheetAsCsv('1ABC123xyz')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not publicly accessible')
    })

    it('should return error for 404 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })

      const result = await fetchSheetAsCsv('1ABC123xyz')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should return error for HTML response (common error page)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve('<html>Error page</html>'),
      })

      const result = await fetchSheetAsCsv('1ABC123xyz')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not publicly accessible')
    })

    it('should return error for empty content', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/csv' }),
        text: () => Promise.resolve(''),
      })

      const result = await fetchSheetAsCsv('1ABC123xyz')

      expect(result.success).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('should return error for network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await fetchSheetAsCsv('1ABC123xyz')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
    })

    it('should pass gid to export URL', async () => {
      const mockCsvContent = 'Ticker,Price\nH2O,100'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/csv' }),
        text: () => Promise.resolve(mockCsvContent),
      })

      await fetchSheetAsCsv('1ABC123xyz', 456)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://docs.google.com/spreadsheets/d/1ABC123xyz/export?format=csv&gid=456',
        expect.any(Object)
      )
    })
  })

  describe('fetchSheetByUrl', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('should fetch sheet by URL', async () => {
      const mockCsvContent = 'Ticker,Price\nH2O,100'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/csv' }),
        text: () => Promise.resolve(mockCsvContent),
      })

      const result = await fetchSheetByUrl(
        'https://docs.google.com/spreadsheets/d/1ABC123xyz/edit#gid=456'
      )

      expect(result.success).toBe(true)
      expect(result.content).toBe(mockCsvContent)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://docs.google.com/spreadsheets/d/1ABC123xyz/export?format=csv&gid=456',
        expect.any(Object)
      )
    })

    it('should return error for invalid URL', async () => {
      const result = await fetchSheetByUrl('not-a-valid-url')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid Google Sheets URL')
    })

    it('should return error for non-Google Sheets URL', async () => {
      const result = await fetchSheetByUrl('https://example.com/spreadsheet')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid Google Sheets URL')
    })
  })
})
