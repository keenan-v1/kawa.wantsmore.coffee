// Sync service - tracks data versions for frontend cache invalidation

import type { SyncState, DataVersions, SyncDataKey } from '@kawakawa/types'
import { settingsService } from './settingsService.js'
import { notificationService } from './notificationService.js'

// Settings keys for data versions
const DATA_VERSION_PREFIX = 'sync.dataVersion.'

// App version from environment (set at build time)
const APP_VERSION = process.env.APP_VERSION || process.env.COMMIT_SHA || 'dev'

/**
 * Get the current sync state for a user
 */
export async function getSyncState(userId: number): Promise<SyncState> {
  const [unreadCount, dataVersions] = await Promise.all([
    notificationService.getUnreadCount(userId),
    getDataVersions(),
  ])

  return {
    unreadCount,
    appVersion: APP_VERSION,
    dataVersions,
  }
}

/**
 * Get all data versions
 */
export async function getDataVersions(): Promise<DataVersions> {
  const allSettings = await settingsService.getAll(DATA_VERSION_PREFIX)
  const versions: DataVersions = {}

  for (const [key, value] of Object.entries(allSettings)) {
    const dataKey = key.replace(DATA_VERSION_PREFIX, '') as SyncDataKey
    const timestamp = parseInt(value, 10)
    if (!isNaN(timestamp)) {
      versions[dataKey] = timestamp
    }
  }

  return versions
}

/**
 * Get the version for a specific data key
 */
export async function getDataVersion(key: SyncDataKey): Promise<number | null> {
  const value = await settingsService.get(`${DATA_VERSION_PREFIX}${key}`)
  if (!value) return null
  const timestamp = parseInt(value, 10)
  return isNaN(timestamp) ? null : timestamp
}

/**
 * Bump the version for a specific data key (sets to current timestamp)
 * Call this when the data changes (e.g., after FIO sync, admin changes)
 */
export async function bumpDataVersion(key: SyncDataKey, userId?: number): Promise<number> {
  const timestamp = Date.now()
  await settingsService.set(`${DATA_VERSION_PREFIX}${key}`, String(timestamp), userId)
  return timestamp
}

/**
 * Bump multiple data versions at once
 */
export async function bumpDataVersions(
  keys: SyncDataKey[],
  userId?: number
): Promise<DataVersions> {
  const timestamp = Date.now()
  const updates: Record<string, string> = {}

  for (const key of keys) {
    updates[`${DATA_VERSION_PREFIX}${key}`] = String(timestamp)
  }

  await settingsService.setMany(updates, userId)

  const versions: DataVersions = {}
  for (const key of keys) {
    versions[key] = timestamp
  }
  return versions
}

export const syncService = {
  getSyncState,
  getDataVersions,
  getDataVersion,
  bumpDataVersion,
  bumpDataVersions,
}
