// Settings Service - Generic key-value settings with history tracking and caching
import { db, settings } from '@kawakawa/db'
import { sql } from 'drizzle-orm'
import type { SettingHistoryEntry } from '@kawakawa/types'

// In-memory cache for current settings
let settingsCache: Map<string, string> | null = null

/**
 * Get a single setting value by key
 * @param key - The setting key (e.g., 'discord.clientId')
 * @returns The current value or null if not set
 */
export async function get(key: string): Promise<string | null> {
  const allSettings = await getAll()
  return allSettings[key] ?? null
}

/**
 * Get all current settings, optionally filtered by prefix
 * @param prefix - Optional prefix to filter keys (e.g., 'discord.')
 * @returns Record of key-value pairs
 */
export async function getAll(prefix?: string): Promise<Record<string, string>> {
  // Return from cache if available
  if (settingsCache) {
    if (prefix) {
      const filtered: Record<string, string> = {}
      for (const [key, value] of settingsCache) {
        if (key.startsWith(prefix)) {
          filtered[key] = value
        }
      }
      return filtered
    }
    return Object.fromEntries(settingsCache)
  }

  // Fetch current settings using DISTINCT ON to get latest value per key
  // PostgreSQL: DISTINCT ON (key) ORDER BY key, effectiveAt DESC
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (key) key, value
    FROM settings
    WHERE effective_at <= NOW()
    ORDER BY key, effective_at DESC
  `)

  // Populate cache
  settingsCache = new Map()
  for (const row of rows as unknown as Array<{ key: string; value: string }>) {
    settingsCache.set(row.key, row.value)
  }

  // Filter by prefix if requested
  if (prefix) {
    const filtered: Record<string, string> = {}
    for (const [key, value] of settingsCache) {
      if (key.startsWith(prefix)) {
        filtered[key] = value
      }
    }
    return filtered
  }

  return Object.fromEntries(settingsCache)
}

/**
 * Set a single setting value
 * @param key - The setting key
 * @param value - The value to set
 * @param userId - Optional user ID who made the change (null for system)
 */
export async function set(key: string, value: string, userId?: number): Promise<void> {
  await db.insert(settings).values({
    key,
    value,
    changedByUserId: userId ?? null,
    effectiveAt: new Date(),
  })

  // Invalidate cache
  invalidateCache()
}

/**
 * Set multiple settings atomically
 * @param settingsToSet - Record of key-value pairs to set
 * @param userId - Optional user ID who made the change (null for system)
 */
export async function setMany(
  settingsToSet: Record<string, string>,
  userId?: number
): Promise<void> {
  const now = new Date()
  const values = Object.entries(settingsToSet).map(([key, value]) => ({
    key,
    value,
    changedByUserId: userId ?? null,
    effectiveAt: now,
  }))

  if (values.length > 0) {
    await db.insert(settings).values(values)
  }

  // Invalidate cache
  invalidateCache()
}

/**
 * Get the history of changes for a specific setting key
 * @param key - The setting key
 * @param limit - Maximum number of history entries to return (default 50)
 * @returns Array of history entries, most recent first
 */
export async function getHistory(key: string, limit: number = 50): Promise<SettingHistoryEntry[]> {
  const rows = await db.execute(sql`
    SELECT
      s.id,
      s.key,
      s.value,
      u.username as changed_by_username,
      s.effective_at,
      s.created_at
    FROM settings s
    LEFT JOIN users u ON s.changed_by_user_id = u.id
    WHERE s.key = ${key}
    ORDER BY s.effective_at DESC
    LIMIT ${limit}
  `)

  return (
    rows as unknown as Array<{
      id: number
      key: string
      value: string
      changed_by_username: string | null
      effective_at: Date
      created_at: Date
    }>
  ).map(row => ({
    id: row.id,
    key: row.key,
    value: row.value,
    changedByUsername: row.changed_by_username,
    effectiveAt: row.effective_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  }))
}

/**
 * Invalidate the settings cache
 * Call this when settings are modified outside of this service
 */
export function invalidateCache(): void {
  settingsCache = null
}

/**
 * Check if a setting exists
 * @param key - The setting key
 * @returns true if the setting exists
 */
export async function exists(key: string): Promise<boolean> {
  const value = await get(key)
  return value !== null
}

// Export as namespace for cleaner imports
export const settingsService = {
  get,
  getAll,
  set,
  setMany,
  getHistory,
  invalidateCache,
  exists,
}

export default settingsService
