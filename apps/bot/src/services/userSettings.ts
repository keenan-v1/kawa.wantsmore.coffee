/**
 * User Settings Service for Discord Bot
 * Fetches user preferences from the database for display formatting.
 */

import { db, userSettings, userDiscordProfiles } from '@kawakawa/db'
import { eq, and, inArray } from 'drizzle-orm'
import { settingsService } from '@kawakawa/services/settings'
import type { LocationDisplayMode } from '@kawakawa/types'

// Default values (must match packages/types/src/settings.ts)
const DEFAULTS = {
  'display.locationDisplayMode': 'both' as LocationDisplayMode,
  'market.preferredCurrency': 'CIS',
  'market.defaultPriceList': null as string | null,
  'market.automaticPricing': false,
  'market.favoritedLocations': [] as string[],
  'market.favoritedCommodities': [] as string[],
}

// Cache for user settings (TTL: 5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<number, { settings: Record<string, unknown>; expiresAt: number }>()

// Admin defaults cache
let adminDefaultsCache: Record<string, unknown> | null = null
let adminDefaultsCacheTime = 0
const ADMIN_DEFAULTS_PREFIX = 'defaults.'

/**
 * Get admin-configured defaults from the settings table
 */
async function getAdminDefaults(): Promise<Record<string, unknown>> {
  if (adminDefaultsCache && Date.now() - adminDefaultsCacheTime < CACHE_TTL_MS) {
    return adminDefaultsCache
  }

  const raw = await settingsService.getAll(ADMIN_DEFAULTS_PREFIX)
  adminDefaultsCache = {}

  for (const [fullKey, value] of Object.entries(raw)) {
    const key = fullKey.replace(ADMIN_DEFAULTS_PREFIX, '')
    try {
      adminDefaultsCache[key] = JSON.parse(value)
    } catch {
      // Skip invalid JSON
    }
  }

  adminDefaultsCacheTime = Date.now()
  return adminDefaultsCache
}

/**
 * Get all settings for a user by their app user ID.
 * Resolution order: code defaults -> admin defaults -> user overrides
 */
export async function getUserSettings(userId: number): Promise<Record<string, unknown>> {
  // Check cache
  const cached = cache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.settings
  }

  // Start with code defaults
  const settings: Record<string, unknown> = { ...DEFAULTS }

  // Apply admin defaults
  const adminDefaults = await getAdminDefaults()
  for (const [key, value] of Object.entries(adminDefaults)) {
    if (key in DEFAULTS) {
      settings[key] = value
    }
  }

  // Fetch user overrides from database
  const rows = await db
    .select({
      key: userSettings.settingKey,
      value: userSettings.value,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))

  // Apply user overrides
  for (const row of rows) {
    if (row.key in DEFAULTS) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        // Invalid JSON, skip
      }
    }
  }

  // Cache result
  cache.set(userId, {
    settings,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  return settings
}

/**
 * Get settings for a Discord user (looks up app user ID first).
 * Returns null if user is not linked to an app account.
 */
export async function getSettingsByDiscordId(
  discordId: string
): Promise<Record<string, unknown> | null> {
  const profile = await db.query.userDiscordProfiles.findFirst({
    where: eq(userDiscordProfiles.discordId, discordId),
  })

  if (!profile) {
    return null
  }

  return getUserSettings(profile.userId)
}

/**
 * Get display settings for a Discord user with fallbacks.
 */
export async function getDisplaySettings(discordId: string): Promise<{
  locationDisplayMode: LocationDisplayMode
  preferredCurrency: string
  favoritedLocations: string[]
  favoritedCommodities: string[]
}> {
  const settings = await getSettingsByDiscordId(discordId)

  return {
    locationDisplayMode: (settings?.['display.locationDisplayMode'] ??
      DEFAULTS['display.locationDisplayMode']) as LocationDisplayMode,
    preferredCurrency: (settings?.['market.preferredCurrency'] ??
      DEFAULTS['market.preferredCurrency']) as string,
    favoritedLocations: (settings?.['market.favoritedLocations'] ??
      DEFAULTS['market.favoritedLocations']) as string[],
    favoritedCommodities: (settings?.['market.favoritedCommodities'] ??
      DEFAULTS['market.favoritedCommodities']) as string[],
  }
}

/**
 * Get market settings for a user by their app user ID.
 * Used for auto-pricing features.
 */
export async function getMarketSettings(userId: number): Promise<{
  preferredCurrency: string
  defaultPriceList: string | null
  automaticPricing: boolean
}> {
  const settings = await getUserSettings(userId)

  return {
    preferredCurrency: (settings['market.preferredCurrency'] ??
      DEFAULTS['market.preferredCurrency']) as string,
    defaultPriceList: (settings['market.defaultPriceList'] ??
      DEFAULTS['market.defaultPriceList']) as string | null,
    automaticPricing: (settings['market.automaticPricing'] ??
      DEFAULTS['market.automaticPricing']) as boolean,
  }
}

/**
 * Get FIO usernames for multiple users.
 * Returns a Map from userId to fioUsername.
 * Users without FIO usernames are not included in the map.
 */
export async function getFioUsernames(userIds: number[]): Promise<Map<number, string>> {
  if (userIds.length === 0) {
    return new Map()
  }

  // Deduplicate user IDs
  const uniqueIds = [...new Set(userIds)]

  // Fetch fio.username settings for these users
  const rows = await db
    .select({
      userId: userSettings.userId,
      value: userSettings.value,
    })
    .from(userSettings)
    .where(
      and(eq(userSettings.settingKey, 'fio.username'), inArray(userSettings.userId, uniqueIds))
    )

  const result = new Map<number, string>()

  for (const row of rows) {
    try {
      const fioUsername = JSON.parse(row.value)
      if (typeof fioUsername === 'string' && fioUsername.trim()) {
        result.set(row.userId, fioUsername)
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return result
}

/**
 * Invalidate cache for a user
 */
export function invalidateCache(userId: number): void {
  cache.delete(userId)
}

/**
 * Clear all caches
 */
export function clearCache(): void {
  cache.clear()
  adminDefaultsCache = null
  adminDefaultsCacheTime = 0
}
