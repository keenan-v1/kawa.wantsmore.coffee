/**
 * Location Service for Discord Bot
 * Handles location lookup and formatting.
 */

import { db, fioLocations } from '@kawakawa/db'
import type { LocationDisplayMode } from '@kawakawa/types'

export interface LocationInfo {
  naturalId: string
  name: string
  type: string
}

// In-memory cache for locations (indexed by both naturalId and name)
let cache: Map<string, LocationInfo> | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Ensure cache is loaded from database
 */
async function ensureCacheLoaded(): Promise<void> {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) {
    return
  }

  const locations = await db
    .select({
      naturalId: fioLocations.naturalId,
      name: fioLocations.name,
      type: fioLocations.type,
    })
    .from(fioLocations)

  cache = new Map()
  for (const l of locations) {
    // Index by naturalId
    cache.set(l.naturalId.toUpperCase(), l)
    // Also index by name for lookup by name
    cache.set(l.name.toUpperCase(), l)
  }

  cacheLoadedAt = Date.now()
}

/**
 * Format a location ID according to user preferences.
 */
export async function formatLocation(
  locationId: string,
  mode: LocationDisplayMode = 'both'
): Promise<string> {
  await ensureCacheLoaded()

  const location = cache?.get(locationId.toUpperCase())
  if (!location) {
    return locationId // Return as-is if not found
  }

  switch (mode) {
    case 'natural-ids-only':
      return location.naturalId
    case 'names-only':
      return location.name
    case 'both':
    default:
      return `${location.name} (${location.naturalId})`
  }
}

/**
 * Validate and resolve a location input.
 * Returns the location if valid, or null if not found.
 * Only matches exact naturalId or exact name (case-insensitive).
 */
export async function resolveLocation(input: string): Promise<LocationInfo | null> {
  await ensureCacheLoaded()

  const match = cache?.get(input.toUpperCase())
  if (match) {
    return match
  }

  return null
}

/**
 * Get location info by ID (cached).
 */
export async function getLocation(locationId: string): Promise<LocationInfo | null> {
  await ensureCacheLoaded()
  return cache?.get(locationId.toUpperCase()) ?? null
}

/**
 * Get all cached locations (unique by naturalId).
 */
export async function getAllLocations(): Promise<LocationInfo[]> {
  await ensureCacheLoaded()
  if (!cache) return []

  // Deduplicate since we index by both naturalId and name
  const seen = new Set<string>()
  const result: LocationInfo[] = []
  for (const loc of cache.values()) {
    if (!seen.has(loc.naturalId)) {
      seen.add(loc.naturalId)
      result.push(loc)
    }
  }
  return result
}

/**
 * Clear the location cache.
 */
export function clearLocationCache(): void {
  cache = null
  cacheLoadedAt = 0
}

/**
 * For testing: inject a mock cache
 */
export function _setCache(mockCache: Map<string, LocationInfo> | null): void {
  cache = mockCache
  cacheLoadedAt = mockCache ? Date.now() : 0
}
