/**
 * Query Parser Composable
 *
 * Parses search input similar to the bot's /query command:
 * - Detects XIT ACT JSON format and extracts material requirements
 * - XIT JSON is treated as a token, allowing additional tokens after it
 *   (e.g., "{...json...} BEN" filters XIT commodities at BEN location)
 * - Supports token prefixes: commodity:, location:, user:
 * - Auto-resolves bare tokens (tries commodity → location → user)
 */

import { ref, watch, type Ref } from 'vue'
import { parseXitJson, type XitMaterials } from '@kawakawa/types/xit'
import { commodityService } from '../services/commodityService'
import { locationService } from '../services/locationService'

export interface QueryParseResult {
  /** Commodity tickers resolved from query */
  commodities: string[]
  /** Location IDs resolved from query */
  locations: string[]
  /** Usernames resolved from query */
  userNames: string[]
  /** XIT quantities when XIT JSON is detected */
  xitQuantities: XitMaterials | null
  /** XIT name from global.name if present */
  xitName: string | undefined
  /** Whether XIT mode is active */
  isXitActive: boolean
  /** Order type to force (e.g., 'sell' when XIT is active) */
  forcedItemType: 'sell' | null
  /** Tokens that couldn't be resolved */
  unresolved: string[]
  /** Whether any tokens were successfully parsed (skip text search if true) */
  parsed: boolean
}

export interface UseQueryParserOptions {
  /** The search input ref to watch */
  search: Ref<string | null>
  /** Available usernames for user resolution (from market data) */
  availableUserNames: Ref<string[]>
  /** Callback when filters should be updated */
  onFiltersChange?: (result: QueryParseResult) => void
}

export interface UseQueryParserReturn {
  /** Current parse result */
  parseResult: Ref<QueryParseResult>
  /** Clear the parsed state */
  clear: () => void
}

/**
 * Create an empty parse result
 */
function createEmptyResult(): QueryParseResult {
  return {
    commodities: [],
    locations: [],
    userNames: [],
    xitQuantities: null,
    xitName: undefined,
    isXitActive: false,
    forcedItemType: null,
    unresolved: [],
    parsed: false,
  }
}

/**
 * Extract a JSON object from the start of a string.
 * Returns the JSON string and the remainder, or null if not valid JSON structure.
 */
function extractJsonToken(input: string): { json: string; remainder: string } | null {
  if (!input.startsWith('{')) {
    return null
  }

  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        // Found the end of the JSON object
        return {
          json: input.slice(0, i + 1),
          remainder: input.slice(i + 1).trim(),
        }
      }
    }
  }

  // Unbalanced braces - return the whole thing as JSON attempt
  return { json: input, remainder: '' }
}

/**
 * Parse a single token and attempt to resolve it
 */
function parseToken(
  token: string,
  availableUserNames: string[]
): { type: 'commodity' | 'location' | 'user' | null; value: string } {
  // Check for prefix
  if (token.startsWith('commodity:')) {
    const ticker = token.slice('commodity:'.length).toUpperCase()
    const commodities = commodityService.getAllCommoditiesSync()
    const found = commodities.find(c => c.ticker === ticker)
    return found ? { type: 'commodity', value: found.ticker } : { type: null, value: token }
  }

  if (token.startsWith('location:')) {
    const locationId = token.slice('location:'.length).toUpperCase()
    const locations = locationService.getAllLocationsSync()
    // Match by ID (natural ID) or name
    const found = locations.find(
      l => l.id.toUpperCase() === locationId || l.name.toUpperCase() === locationId
    )
    return found ? { type: 'location', value: found.id } : { type: null, value: token }
  }

  if (token.startsWith('user:')) {
    const userName = token.slice('user:'.length).toLowerCase()
    // Case-insensitive match on username
    const found = availableUserNames.find(u => u.toLowerCase() === userName)
    return found ? { type: 'user', value: found } : { type: null, value: token }
  }

  // No prefix - auto-detect: commodity → location → user
  const upperToken = token.toUpperCase()
  const lowerToken = token.toLowerCase()

  // Try commodity first
  const commodities = commodityService.getAllCommoditiesSync()
  const commodity = commodities.find(c => c.ticker === upperToken)
  if (commodity) {
    return { type: 'commodity', value: commodity.ticker }
  }

  // Try location (by ID or name)
  const locations = locationService.getAllLocationsSync()
  const location = locations.find(
    l => l.id.toUpperCase() === upperToken || l.name.toUpperCase() === upperToken
  )
  if (location) {
    return { type: 'location', value: location.id }
  }

  // Try user
  const user = availableUserNames.find(u => u.toLowerCase() === lowerToken)
  if (user) {
    return { type: 'user', value: user }
  }

  return { type: null, value: token }
}

/**
 * Composable for parsing search queries with token and XIT support
 */
export function useQueryParser(options: UseQueryParserOptions): UseQueryParserReturn {
  const { search, availableUserNames, onFiltersChange } = options

  const parseResult = ref<QueryParseResult>(createEmptyResult())

  // Parse the search input
  const parseSearch = (input: string | null): QueryParseResult => {
    if (!input || !input.trim()) {
      return createEmptyResult()
    }

    const trimmed = input.trim()

    let xitQuantities: XitMaterials | null = null
    let xitName: string | undefined = undefined
    let isXitActive = false
    let xitCommodities: string[] = []
    let remainingInput = trimmed

    // Check for XIT JSON first - extract it as a token and continue parsing the rest
    if (trimmed.startsWith('{')) {
      const extracted = extractJsonToken(trimmed)
      if (extracted) {
        const xitResult = parseXitJson(extracted.json)
        if (xitResult.success) {
          xitQuantities = xitResult.materials
          xitName = xitResult.name
          isXitActive = true
          xitCommodities = Object.keys(xitResult.materials)
          remainingInput = extracted.remainder
        }
      }
    }

    // Normal token parsing - split by comma or whitespace
    const tokens = remainingInput.split(/[,\s]+/).filter(Boolean)

    const commodities: string[] = []
    const locations: string[] = []
    const userNames: string[] = []
    const unresolved: string[] = []

    for (const token of tokens) {
      const result = parseToken(token, availableUserNames.value)

      if (result.type === 'commodity') {
        if (!commodities.includes(result.value)) {
          commodities.push(result.value)
        }
      } else if (result.type === 'location') {
        if (!locations.includes(result.value)) {
          locations.push(result.value)
        }
      } else if (result.type === 'user') {
        if (!userNames.includes(result.value)) {
          userNames.push(result.value)
        }
      } else {
        unresolved.push(result.value)
      }
    }

    // Combine XIT commodities with any additional parsed commodities
    const allCommodities = [...xitCommodities]
    for (const c of commodities) {
      if (!allCommodities.includes(c)) {
        allCommodities.push(c)
      }
    }

    const parsed =
      isXitActive || allCommodities.length > 0 || locations.length > 0 || userNames.length > 0

    return {
      commodities: allCommodities,
      locations,
      userNames,
      xitQuantities,
      xitName,
      isXitActive,
      forcedItemType: isXitActive ? 'sell' : null, // XIT is always a buying context
      unresolved,
      parsed,
    }
  }

  // Watch for search changes
  watch(
    search,
    newValue => {
      const result = parseSearch(newValue)
      parseResult.value = result

      // Always notify callback so it can update/clear filters as needed
      if (onFiltersChange) {
        onFiltersChange(result)
      }
    },
    { immediate: true }
  )

  const clear = () => {
    parseResult.value = createEmptyResult()
  }

  return {
    parseResult,
    clear,
  }
}
