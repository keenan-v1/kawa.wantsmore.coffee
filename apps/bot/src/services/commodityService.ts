/**
 * Commodity Service for Discord Bot
 * Handles commodity lookup and formatting.
 */

import { db, fioCommodities } from '@kawakawa/db'
import type { CommodityDisplayMode } from '@kawakawa/types'

export interface CommodityInfo {
  ticker: string
  name: string
  categoryName: string | null
}

// In-memory cache for commodities
let cache: Map<string, CommodityInfo> | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Ensure cache is loaded from database
 */
async function ensureCacheLoaded(): Promise<void> {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return
  }

  const commodities = await db
    .select({
      ticker: fioCommodities.ticker,
      name: fioCommodities.name,
      categoryName: fioCommodities.categoryName,
    })
    .from(fioCommodities)

  cache = new Map()
  for (const c of commodities) {
    cache.set(c.ticker.toUpperCase(), c)
  }

  cacheLoadedAt = Date.now()
}

/**
 * Format a commodity ticker for display.
 * Returns just the ticker (universal across all languages).
 */
export function formatCommodity(ticker: string): string {
  return ticker.toUpperCase()
}

/**
 * Format a commodity ticker according to user preferences.
 * Async because it needs to lookup the commodity name from cache/db.
 */
export async function formatCommodityWithMode(
  ticker: string,
  mode: CommodityDisplayMode = 'both'
): Promise<string> {
  await ensureCacheLoaded()

  const commodity = cache?.get(ticker.toUpperCase())
  if (!commodity) {
    return ticker.toUpperCase() // Return as-is if not found
  }

  switch (mode) {
    case 'ticker-only':
      return commodity.ticker
    case 'name-only':
      return commodity.name
    case 'both':
    default:
      return `${commodity.ticker} - ${commodity.name}`
  }
}

/**
 * Validate and resolve a commodity input.
 * Returns the commodity if valid, or null if not found.
 * Only matches exact ticker (case-insensitive).
 */
export async function resolveCommodity(
  input: string
): Promise<{ ticker: string; name: string } | null> {
  await ensureCacheLoaded()

  const byTicker = cache?.get(input.toUpperCase())
  if (byTicker) {
    return { ticker: byTicker.ticker, name: byTicker.name }
  }

  return null
}

/**
 * Get commodity info by ticker (cached).
 */
export async function getCommodity(ticker: string): Promise<CommodityInfo | null> {
  await ensureCacheLoaded()
  return cache?.get(ticker.toUpperCase()) ?? null
}

/**
 * Get all cached commodities.
 */
export async function getAllCommodities(): Promise<CommodityInfo[]> {
  await ensureCacheLoaded()
  return cache ? Array.from(cache.values()) : []
}

/**
 * Clear the commodity cache.
 */
export function clearCommodityCache(): void {
  cache = null
  cacheLoadedAt = 0
}

/**
 * For testing: inject a mock cache
 */
export function _setCache(mockCache: Map<string, CommodityInfo> | null): void {
  cache = mockCache
  cacheLoadedAt = mockCache ? Date.now() : 0
}
