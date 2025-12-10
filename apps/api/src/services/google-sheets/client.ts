import { createLogger } from '../../utils/logger.js'

const log = createLogger({ service: 'google-sheets' })

export interface ParsedSheetsUrl {
  spreadsheetId: string
  sheetGid?: number
}

/**
 * Parse a Google Sheets URL to extract spreadsheet ID and optional sheet GID
 *
 * Supported formats:
 * - https://docs.google.com/spreadsheets/d/{ID}/edit#gid={SHEET_ID}
 * - https://docs.google.com/spreadsheets/d/{ID}/edit?gid={SHEET_ID}
 * - https://docs.google.com/spreadsheets/d/{ID}/
 * - https://docs.google.com/spreadsheets/d/{ID}
 */
export function parseGoogleSheetsUrl(url: string): ParsedSheetsUrl | null {
  try {
    const parsed = new URL(url)

    // Must be a Google Sheets URL
    if (!parsed.hostname.includes('docs.google.com')) {
      return null
    }

    // Extract spreadsheet ID from path: /spreadsheets/d/{ID}/...
    const pathMatch = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    if (!pathMatch) {
      return null
    }

    const spreadsheetId = pathMatch[1]

    // Try to extract sheet GID from hash fragment (#gid=123)
    let sheetGid: number | undefined
    if (parsed.hash) {
      const hashMatch = parsed.hash.match(/gid=(\d+)/)
      if (hashMatch) {
        sheetGid = parseInt(hashMatch[1], 10)
      }
    }

    // Try to extract sheet GID from query parameter (?gid=123)
    if (sheetGid === undefined) {
      const gidParam = parsed.searchParams.get('gid')
      if (gidParam) {
        sheetGid = parseInt(gidParam, 10)
      }
    }

    return { spreadsheetId, sheetGid }
  } catch {
    return null
  }
}

/**
 * Build the CSV export URL for a Google Sheet
 *
 * For public/published sheets, Google provides a CSV export endpoint:
 * https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={GID}
 */
export function buildCsvExportUrl(spreadsheetId: string, sheetGid?: number): string {
  let url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`
  if (sheetGid !== undefined) {
    url += `&gid=${sheetGid}`
  }
  return url
}

export interface FetchSheetResult {
  success: boolean
  content?: string
  error?: string
}

/**
 * Fetch a Google Sheet as CSV content
 *
 * This works for:
 * - Published sheets (File > Share > Publish to web)
 * - Sheets with "Anyone with the link can view" permissions
 *
 * For private sheets, an API key would be needed (future enhancement)
 */
export async function fetchSheetAsCsv(
  spreadsheetId: string,
  sheetGid?: number
): Promise<FetchSheetResult> {
  const exportUrl = buildCsvExportUrl(spreadsheetId, sheetGid)

  log.info({ spreadsheetId, sheetGid, exportUrl }, 'Fetching Google Sheet as CSV')

  try {
    const response = await fetch(exportUrl, {
      headers: {
        // Some sheets need a user agent to work properly
        'User-Agent': 'Kawakawa-CX/1.0',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error:
            'Sheet is not publicly accessible. Please publish the sheet or make it viewable by anyone with the link.',
        }
      }
      if (response.status === 404) {
        return {
          success: false,
          error: 'Sheet not found. Please check the URL and try again.',
        }
      }
      return {
        success: false,
        error: `Failed to fetch sheet: HTTP ${response.status}`,
      }
    }

    const contentType = response.headers.get('content-type') || ''

    // Check if we got HTML instead of CSV (common error page response)
    if (contentType.includes('text/html')) {
      return {
        success: false,
        error:
          'Sheet is not publicly accessible. Please publish the sheet or make it viewable by anyone with the link.',
      }
    }

    const content = await response.text()

    // Basic validation that we got actual CSV content
    if (!content || content.length === 0) {
      return {
        success: false,
        error: 'Sheet appears to be empty',
      }
    }

    log.info({ spreadsheetId, contentLength: content.length }, 'Successfully fetched Google Sheet')

    return {
      success: true,
      content,
    }
  } catch (error) {
    log.error({ spreadsheetId, error }, 'Failed to fetch Google Sheet')
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching sheet',
    }
  }
}

/**
 * Fetch a Google Sheet by URL
 * Convenience method that parses URL and fetches content
 */
export async function fetchSheetByUrl(url: string): Promise<FetchSheetResult> {
  const parsed = parseGoogleSheetsUrl(url)

  if (!parsed) {
    return {
      success: false,
      error:
        'Invalid Google Sheets URL. Expected format: https://docs.google.com/spreadsheets/d/{ID}/...',
    }
  }

  return fetchSheetAsCsv(parsed.spreadsheetId, parsed.sheetGid)
}
