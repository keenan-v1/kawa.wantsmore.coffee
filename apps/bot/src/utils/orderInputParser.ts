/**
 * Order Input Parser
 * Parses flexible user input for /sell, /buy, and /delete commands.
 *
 * Supports:
 * - Comma-separated tickers: "COF,CAF,H2O"
 * - Space-separated tokens: "COF Katoa 1500"
 * - Limit modifiers: "reserve:1000", "r:1000", "max:500", "m:500"
 * - Bare numbers (context-dependent)
 */

import { resolveCommodity, resolveLocation } from '../services/display.js'

/**
 * Limit mode for sell orders
 */
export type LimitMode = 'none' | 'max_sell' | 'reserve'

/**
 * Parsed order input result
 */
export interface ParsedOrderInput {
  /** Resolved commodity tickers (uppercase) */
  tickers: string[]
  /** Resolved location natural ID, or null if not found */
  location: string | null
  /** Quantity (for buy orders) */
  quantity: number | null
  /** Limit mode for sell orders */
  limitMode: LimitMode
  /** Limit quantity when limitMode is not 'none' */
  limitQuantity: number | null
  /** Tokens that couldn't be resolved */
  unresolvedTokens: string[]
  /** Resolved commodity info (for display) */
  resolvedCommodities: Array<{ ticker: string; name: string }>
  /** Resolved location info (for display) */
  resolvedLocation: { naturalId: string; name: string; type: string } | null
}

/**
 * Options for parsing order input
 */
export interface ParseOptions {
  /** Parse for sell order (bare numbers become reserve) */
  forSell?: boolean
  /** Parse for buy order (bare numbers become quantity) */
  forBuy?: boolean
  /** Parse for delete (no numeric processing) */
  forDelete?: boolean
}

/**
 * Parse a limit modifier token
 * Supports: reserve:X, r:X, max:X, m:X
 */
function parseLimitModifier(token: string): {
  mode: LimitMode
  quantity: number
} | null {
  const lowerToken = token.toLowerCase()

  // Check for reserve:X or r:X
  const reserveMatch = lowerToken.match(/^(?:reserve|r):(\d+)$/)
  if (reserveMatch) {
    return { mode: 'reserve', quantity: parseInt(reserveMatch[1], 10) }
  }

  // Check for max:X or m:X
  const maxMatch = lowerToken.match(/^(?:max|m):(\d+)$/)
  if (maxMatch) {
    return { mode: 'max_sell', quantity: parseInt(maxMatch[1], 10) }
  }

  return null
}

/**
 * Parse flexible order input string
 *
 * @param input - User input string (e.g., "COF,CAF Katoa reserve:1000")
 * @param options - Parsing options
 * @returns Parsed order input
 *
 * @example
 * // Single ticker with location
 * parseOrderInput('COF Katoa', { forSell: true })
 * // => { tickers: ['COF'], location: 'Katoa', ... }
 *
 * @example
 * // Comma-separated tickers with reserve
 * parseOrderInput('COF,CAF,H2O Katoa reserve:1000', { forSell: true })
 * // => { tickers: ['COF','CAF','H2O'], location: 'Katoa', limitMode: 'reserve', limitQuantity: 1000 }
 *
 * @example
 * // Buy order with quantity
 * parseOrderInput('COF Katoa 500', { forBuy: true })
 * // => { tickers: ['COF'], location: 'Katoa', quantity: 500 }
 */
export async function parseOrderInput(
  input: string,
  options: ParseOptions = {}
): Promise<ParsedOrderInput> {
  const result: ParsedOrderInput = {
    tickers: [],
    location: null,
    quantity: null,
    limitMode: 'none',
    limitQuantity: null,
    unresolvedTokens: [],
    resolvedCommodities: [],
    resolvedLocation: null,
  }

  // Normalize and split input
  // Split by whitespace first, then handle comma-separated values within the first token
  const rawTokens = input.trim().split(/\s+/).filter(Boolean)

  if (rawTokens.length === 0) {
    return result
  }

  // First token might be comma-separated tickers
  const firstToken = rawTokens[0]
  const tickerCandidates = firstToken.includes(',')
    ? firstToken
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
    : [firstToken]

  // Resolve all ticker candidates
  for (const candidate of tickerCandidates) {
    const commodity = await resolveCommodity(candidate)
    if (commodity) {
      // Avoid duplicates
      if (!result.tickers.includes(commodity.ticker)) {
        result.tickers.push(commodity.ticker)
        result.resolvedCommodities.push(commodity)
      }
    } else {
      result.unresolvedTokens.push(candidate)
    }
  }

  // Process remaining tokens
  for (let i = 1; i < rawTokens.length; i++) {
    const token = rawTokens[i]

    // Check for limit modifier first
    const limitModifier = parseLimitModifier(token)
    if (limitModifier && (options.forSell || options.forDelete)) {
      result.limitMode = limitModifier.mode
      result.limitQuantity = limitModifier.quantity
      continue
    }

    // Check for bare number
    const numberMatch = token.match(/^\d+$/)
    if (numberMatch) {
      const numValue = parseInt(token, 10)

      if (options.forBuy) {
        // For buy orders, bare number is quantity
        result.quantity = numValue
      } else if (options.forSell) {
        // For sell orders, bare number is reserve
        result.limitMode = 'reserve'
        result.limitQuantity = numValue
      }
      // For delete, ignore bare numbers
      continue
    }

    // Try to resolve as location if we don't have one yet
    if (!result.location) {
      const location = await resolveLocation(token)
      if (location) {
        result.location = location.naturalId
        result.resolvedLocation = location
        continue
      }
    }

    // Token couldn't be resolved
    result.unresolvedTokens.push(token)
  }

  return result
}

/**
 * Format limit mode for display
 */
export function formatLimitMode(mode: LimitMode, quantity: number | null): string {
  if (mode === 'none' || quantity === null) {
    return ''
  }

  if (mode === 'reserve') {
    return `reserve ${quantity.toLocaleString()}`
  }

  if (mode === 'max_sell') {
    return `max ${quantity.toLocaleString()}`
  }

  return ''
}

/**
 * Multi-ticker order with individual quantities
 */
export interface MultiOrderItem {
  ticker: string
  quantity: number
  commodityName: string
}

/**
 * Parsed multi-order input result
 */
export interface ParsedMultiOrderInput {
  /** Orders with per-ticker quantities */
  orders: MultiOrderItem[]
  /** Resolved location natural ID, or null if not found */
  location: string | null
  /** Resolved location info (for display) */
  resolvedLocation: { naturalId: string; name: string; type: string } | null
  /** Tokens that couldn't be resolved */
  unresolvedTokens: string[]
  /** Whether the input was parsed as multi-ticker format */
  isMultiFormat: boolean
}

/**
 * Check if a token looks like a number
 */
function isNumericToken(token: string): boolean {
  return /^\d+$/.test(token)
}

/**
 * Parse multi-ticker input with per-ticker quantities.
 *
 * Supports the format: TICKER QTY TICKER QTY ... LOCATION
 * Example: "DW 1000 RAT 1000 OVE 500 BEN"
 *
 * Algorithm:
 * 1. Tokenize input
 * 2. Try to detect TICKER NUMBER pairs
 * 3. Last non-number token is treated as location
 *
 * If the input doesn't match this pattern (e.g., comma-separated tickers
 * with shared quantity), returns isMultiFormat: false and callers should
 * fall back to parseOrderInput().
 *
 * @example
 * parseMultiOrderInput('DW 1000 RAT 1000 OVE 500 BEN')
 * // => {
 * //   orders: [{ ticker: 'DW', quantity: 1000 }, { ticker: 'RAT', quantity: 1000 }, ...],
 * //   location: 'BEN',
 * //   isMultiFormat: true
 * // }
 */
export async function parseMultiOrderInput(input: string): Promise<ParsedMultiOrderInput> {
  const result: ParsedMultiOrderInput = {
    orders: [],
    location: null,
    resolvedLocation: null,
    unresolvedTokens: [],
    isMultiFormat: false,
  }

  const rawTokens = input.trim().split(/\s+/).filter(Boolean)

  if (rawTokens.length === 0) {
    return result
  }

  // Detect if this looks like multi-format (TICKER NUMBER TICKER NUMBER ... LOCATION)
  // Multi-format requires at least 3 tokens and alternating pattern of commodity-number
  if (rawTokens.length < 3) {
    return result
  }

  // Check if first token contains comma (old format) - not multi-format
  if (rawTokens[0].includes(',')) {
    return result
  }

  // Try to parse as multi-format
  // We'll accumulate TICKER NUMBER pairs, and the last non-number token is location
  const pendingOrders: Array<{ ticker: string; quantity: number; commodityName: string }> = []
  let lastNonNumberIndex = -1

  // Find the last non-number token (potential location)
  for (let i = rawTokens.length - 1; i >= 0; i--) {
    if (!isNumericToken(rawTokens[i])) {
      lastNonNumberIndex = i
      break
    }
  }

  // Process tokens looking for TICKER NUMBER pairs
  let i = 0
  while (i < rawTokens.length) {
    const token = rawTokens[i]

    // If this is the last non-number token, try as location
    if (i === lastNonNumberIndex && i === rawTokens.length - 1) {
      const location = await resolveLocation(token)
      if (location) {
        result.location = location.naturalId
        result.resolvedLocation = location
      } else {
        // Maybe it's a commodity without quantity at the end - not multi-format
        return { ...result, isMultiFormat: false }
      }
      i++
      continue
    }

    // Try to resolve as commodity
    const commodity = await resolveCommodity(token)
    if (commodity) {
      // Next token should be a number
      if (i + 1 < rawTokens.length && isNumericToken(rawTokens[i + 1])) {
        const quantity = parseInt(rawTokens[i + 1], 10)
        pendingOrders.push({
          ticker: commodity.ticker,
          quantity,
          commodityName: commodity.name,
        })
        i += 2 // Skip both ticker and quantity
        continue
      } else {
        // Commodity without following number - not multi-format
        return { ...result, isMultiFormat: false }
      }
    }

    // Not a commodity, try as location (if we haven't found one yet)
    if (!result.location) {
      const location = await resolveLocation(token)
      if (location) {
        result.location = location.naturalId
        result.resolvedLocation = location
        i++
        continue
      }
    }

    // Unresolved token
    result.unresolvedTokens.push(token)
    i++
  }

  // Validate we found at least one order
  if (pendingOrders.length === 0) {
    return { ...result, isMultiFormat: false }
  }

  // Success - this is multi-format
  result.orders = pendingOrders
  result.isMultiFormat = true

  return result
}

/**
 * Smart order input parser that detects format automatically.
 *
 * Tries multi-format first (TICKER QTY TICKER QTY ... LOCATION),
 * falls back to single-format if multi-format doesn't match.
 *
 * @example
 * // Multi-format
 * parseSmartOrderInput('DW 1000 RAT 1000 BEN', { forBuy: true })
 * // => { isMultiFormat: true, multi: {...}, single: null }
 *
 * @example
 * // Single-format (comma-separated)
 * parseSmartOrderInput('DW,RAT BEN 1000', { forBuy: true })
 * // => { isMultiFormat: false, multi: null, single: {...} }
 */
export async function parseSmartOrderInput(
  input: string,
  options: ParseOptions = {}
): Promise<{
  isMultiFormat: boolean
  multi: ParsedMultiOrderInput | null
  single: ParsedOrderInput | null
}> {
  // Try multi-format first
  const multiResult = await parseMultiOrderInput(input)

  if (multiResult.isMultiFormat) {
    return { isMultiFormat: true, multi: multiResult, single: null }
  }

  // Fall back to single-format
  const singleResult = await parseOrderInput(input, options)
  return { isMultiFormat: false, multi: null, single: singleResult }
}
