// User Settings Service
// Manages user preferences with caching and validation
// Handles sensitive settings (like fio.apiKey) that are write-only
// Resolution order: code defaults -> admin defaults -> user overrides

import { db, userSettings } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import {
  SETTING_DEFINITIONS,
  type SettingKey,
  SETTING_KEYS,
  isSettingSensitive,
} from '@kawakawa/types/settings'
import type { SettingDefinition } from '@kawakawa/types'
import { settingsService } from './settingsService.js'

// ==================== CACHING ====================

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  values: Map<string, unknown>
  expiresAt: number
}

// User-specific settings cache
const cache = new Map<number, CacheEntry>()

// Admin defaults cache (shared across all users)
let adminDefaultsCache: Record<string, unknown> | null = null
let adminDefaultsCacheTime = 0
const ADMIN_DEFAULTS_PREFIX = 'defaults.'

// ==================== ADMIN DEFAULTS ====================

/**
 * Get admin-configured defaults from the settings table
 * Uses a separate cache since these rarely change
 */
async function getAdminDefaults(): Promise<Record<string, unknown>> {
  // Return from cache if valid
  if (adminDefaultsCache && Date.now() - adminDefaultsCacheTime < CACHE_TTL_MS) {
    return adminDefaultsCache
  }

  // Fetch admin defaults with the 'defaults.' prefix
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
 * Invalidate the admin defaults cache
 * Call this when admin defaults are modified
 */
export function invalidateAdminDefaultsCache(): void {
  adminDefaultsCache = null
  adminDefaultsCacheTime = 0
}

// ==================== PUBLIC API ====================

/**
 * Get all settings for a user, with defaults applied
 * Resolution order: code defaults -> admin defaults -> user overrides
 * Sensitive settings (like fio.apiKey) are excluded from the response
 * @param includeSensitive - If true, include sensitive values (for internal use only)
 */
export async function getAllSettings(
  userId: number,
  includeSensitive = false
): Promise<Record<string, unknown>> {
  // Check cache (only for non-sensitive requests)
  if (!includeSensitive) {
    const cached = cache.get(userId)
    if (cached && cached.expiresAt > Date.now()) {
      return Object.fromEntries(cached.values)
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

  // 1. Start with code defaults from definitions (excluding sensitive unless requested)
  const settings = new Map<string, unknown>()
  for (const key of SETTING_KEYS) {
    if (!includeSensitive && isSettingSensitive(key)) {
      continue // Skip sensitive settings in public response
    }
    settings.set(key, SETTING_DEFINITIONS[key].defaultValue)
  }

  // 2. Apply admin defaults (override code defaults)
  const adminDefaults = await getAdminDefaults()
  for (const [key, value] of Object.entries(adminDefaults)) {
    if (key in SETTING_DEFINITIONS) {
      // Skip sensitive settings unless explicitly requested
      if (!includeSensitive && isSettingSensitive(key as SettingKey)) {
        continue
      }
      settings.set(key, value)
    }
  }

  // 3. Apply user overrides (override admin defaults)
  for (const row of rows) {
    if (row.key in SETTING_DEFINITIONS) {
      // Skip sensitive settings unless explicitly requested
      if (!includeSensitive && isSettingSensitive(row.key as SettingKey)) {
        continue
      }
      try {
        settings.set(row.key, JSON.parse(row.value))
      } catch {
        // Invalid JSON, skip and use default
        console.warn(`Invalid JSON for setting ${row.key}, using default`)
      }
    }
  }

  // Cache result (only for non-sensitive requests)
  if (!includeSensitive) {
    cache.set(userId, {
      values: settings,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })
  }

  return Object.fromEntries(settings)
}

/**
 * Get a single setting value for a user
 */
export async function getSetting<K extends SettingKey>(userId: number, key: K): Promise<unknown> {
  const all = await getAllSettings(userId)
  return all[key]
}

/**
 * Set a single setting value for a user
 */
export async function setSetting(userId: number, key: string, value: unknown): Promise<void> {
  // Validate key exists
  if (!(key in SETTING_DEFINITIONS)) {
    throw new Error(`Unknown setting: ${key}`)
  }

  // Validate value type
  const def = SETTING_DEFINITIONS[key as SettingKey]
  validateSettingValue(def, value)

  // Upsert value using ON CONFLICT
  await db
    .insert(userSettings)
    .values({
      userId,
      settingKey: key,
      value: JSON.stringify(value),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.settingKey],
      set: {
        value: JSON.stringify(value),
        updatedAt: new Date(),
      },
    })

  // Invalidate cache
  invalidateCache(userId)
}

/**
 * Set multiple settings for a user atomically
 */
export async function setSettings(
  userId: number,
  settingsToUpdate: Record<string, unknown>
): Promise<void> {
  // Validate all settings first
  for (const [key, value] of Object.entries(settingsToUpdate)) {
    if (!(key in SETTING_DEFINITIONS)) {
      throw new Error(`Unknown setting: ${key}`)
    }
    const def = SETTING_DEFINITIONS[key as SettingKey]
    validateSettingValue(def, value)
  }

  // Update each setting
  for (const [key, value] of Object.entries(settingsToUpdate)) {
    await db
      .insert(userSettings)
      .values({
        userId,
        settingKey: key,
        value: JSON.stringify(value),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userSettings.userId, userSettings.settingKey],
        set: {
          value: JSON.stringify(value),
          updatedAt: new Date(),
        },
      })
  }

  // Invalidate cache
  invalidateCache(userId)
}

/**
 * Reset a setting to its default value (delete user override)
 */
export async function resetSetting(userId: number, key: string): Promise<void> {
  if (!(key in SETTING_DEFINITIONS)) {
    throw new Error(`Unknown setting: ${key}`)
  }

  await db
    .delete(userSettings)
    .where(and(eq(userSettings.userId, userId), eq(userSettings.settingKey, key)))

  // Invalidate cache
  invalidateCache(userId)
}

/**
 * Reset all settings for a user to defaults
 */
export async function resetAllSettings(userId: number): Promise<void> {
  await db.delete(userSettings).where(eq(userSettings.userId, userId))

  // Invalidate cache
  invalidateCache(userId)
}

// ==================== FIO CREDENTIALS ====================

/**
 * Get FIO credentials for a user (for internal use only - bypasses sensitive filter)
 * Returns null for username/apiKey if not set
 */
export async function getFioCredentials(
  userId: number
): Promise<{ fioUsername: string | null; fioApiKey: string | null }> {
  const allSettings = await getAllSettings(userId, true) // Include sensitive settings
  return {
    fioUsername: (allSettings['fio.username'] as string) || null,
    fioApiKey: (allSettings['fio.apiKey'] as string) || null,
  }
}

/**
 * Check if a user has FIO credentials configured
 */
export async function hasFioCredentials(userId: number): Promise<boolean> {
  const { fioUsername, fioApiKey } = await getFioCredentials(userId)
  return !!fioUsername && !!fioApiKey
}

// ==================== CACHE MANAGEMENT ====================

/**
 * Invalidate the cache for a specific user
 */
export function invalidateCache(userId: number): void {
  cache.delete(userId)
}

/**
 * Clear the entire settings cache (for testing or admin)
 */
export function clearCache(): void {
  cache.clear()
}

// ==================== VALIDATION ====================

/**
 * Validate a setting value matches the expected type
 */
function validateSettingValue(def: SettingDefinition, value: unknown): void {
  switch (def.type) {
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error(`${def.key} must be a boolean`)
      }
      break

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`${def.key} must be a number`)
      }
      break

    case 'string':
      if (typeof value !== 'string') {
        throw new Error(`${def.key} must be a string`)
      }
      break

    case 'enum':
      if (typeof value !== 'string' || !def.enumOptions?.includes(value)) {
        throw new Error(
          `${def.key} must be one of: ${def.enumOptions?.join(', ') ?? 'no options defined'}`
        )
      }
      break

    case 'string[]':
      if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
        throw new Error(`${def.key} must be an array of strings`)
      }
      break

    default:
      // Unknown type, allow anything
      break
  }
}

// ==================== EXPORTS ====================

export const userSettingsService = {
  getAllSettings,
  getSetting,
  setSetting,
  setSettings,
  resetSetting,
  resetAllSettings,
  getFioCredentials,
  hasFioCredentials,
  invalidateCache,
  clearCache,
  invalidateAdminDefaultsCache,
}

export default userSettingsService
