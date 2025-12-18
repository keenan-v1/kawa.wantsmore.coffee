// Sync service - handles polling for sync state and cache invalidation

import type { SyncState, DataVersions, SyncDataKey } from '@kawakawa/types'
import { locationService } from './locationService'
import { commodityService } from './commodityService'

// Polling interval (30 seconds)
const POLL_INTERVAL = 30 * 1000

// Storage key for initial app version (use sessionStorage so it resets per browser session)
const APP_VERSION_KEY = 'kawakawa:appVersion'

// Current sync state
let currentSyncState: SyncState | null = null
let pollIntervalId: ReturnType<typeof setInterval> | null = null
let isPolling = false

// Helper to get initial app version from sessionStorage (read fresh each time for easier testing)
function getStoredAppVersion(): string | null {
  return sessionStorage.getItem(APP_VERSION_KEY)
}

// Event names
export const SYNC_EVENTS = {
  UNREAD_COUNT_CHANGED: 'sync:unread-count-changed',
  DATA_UPDATED: 'sync:data-updated',
  APP_VERSION_CHANGED: 'sync:app-version-changed',
} as const

// Fetch sync state from API
async function fetchSyncState(): Promise<SyncState | null> {
  try {
    const response = await fetch('/api/sync/state', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`,
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid - stop polling
        stopPolling()
        return null
      }
      throw new Error(`Failed to fetch sync state: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch sync state:', error)
    return null
  }
}

// Process sync state and handle version changes
async function processSyncState(newState: SyncState): Promise<void> {
  const oldState = currentSyncState

  // Check for unread count changes
  if (!oldState || newState.unreadCount !== oldState.unreadCount) {
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENTS.UNREAD_COUNT_CHANGED, {
        detail: {
          count: newState.unreadCount,
          previousCount: oldState?.unreadCount ?? 0,
        },
      })
    )
  }

  // Get stored app version (read fresh from sessionStorage for easier testing)
  const storedAppVersion = getStoredAppVersion()

  // Capture initial app version on first sync
  if (!storedAppVersion) {
    sessionStorage.setItem(APP_VERSION_KEY, newState.appVersion)
  } else if (newState.appVersion !== storedAppVersion) {
    // Check for app version changes - compare against stored version
    // This detects deployments that happened after the page was loaded
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENTS.APP_VERSION_CHANGED, {
        detail: {
          newVersion: newState.appVersion,
          oldVersion: storedAppVersion,
        },
      })
    )
  }

  // Check for data version changes and invalidate caches
  const updatedKeys: SyncDataKey[] = []

  for (const key of Object.keys(newState.dataVersions) as SyncDataKey[]) {
    const newVersion = newState.dataVersions[key]
    const oldVersion = oldState?.dataVersions?.[key]

    if (newVersion && (!oldVersion || newVersion > oldVersion)) {
      updatedKeys.push(key)

      // Invalidate the appropriate cache
      switch (key) {
        case 'locations':
          locationService.clearCache()
          // Prefetch new data
          locationService.prefetch()
          break
        case 'commodities':
          commodityService.clearCache()
          // Prefetch new data
          commodityService.prefetch()
          break
        case 'priceLists':
          // Price lists cache will be added later
          break
        case 'globalDefaults':
          // Global defaults affect user settings - could reload settings store
          break
      }
    }
  }

  // Emit data updated event if any data changed
  if (updatedKeys.length > 0) {
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENTS.DATA_UPDATED, {
        detail: { updatedKeys },
      })
    )
  }

  // Update current state
  currentSyncState = newState
}

// Poll for sync state
async function poll(): Promise<void> {
  if (isPolling) return
  isPolling = true

  try {
    const newState = await fetchSyncState()
    if (newState) {
      await processSyncState(newState)
    }
  } finally {
    isPolling = false
  }
}

// Start polling
export function startPolling(): void {
  if (pollIntervalId) return // Already polling

  // Immediately poll once
  poll()

  // Then poll at regular intervals
  pollIntervalId = setInterval(poll, POLL_INTERVAL)
}

// Stop polling
export function stopPolling(): void {
  if (pollIntervalId) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
  }
}

// Get current sync state
export function getSyncState(): SyncState | null {
  return currentSyncState
}

// Get current unread count
export function getUnreadCount(): number {
  return currentSyncState?.unreadCount ?? 0
}

// Get current data versions
export function getDataVersions(): DataVersions {
  return currentSyncState?.dataVersions ?? {}
}

// Check if app has been updated
export function hasAppUpdate(): boolean {
  const storedAppVersion = getStoredAppVersion()
  return !!(
    currentSyncState &&
    storedAppVersion &&
    currentSyncState.appVersion !== storedAppVersion
  )
}

// Force refresh sync state (useful after login)
export async function refreshSyncState(): Promise<SyncState | null> {
  const state = await fetchSyncState()
  if (state) {
    // Capture initial app version if not set
    if (!getStoredAppVersion()) {
      sessionStorage.setItem(APP_VERSION_KEY, state.appVersion)
    }
    currentSyncState = state
  }
  return state
}

export const syncService = {
  startPolling,
  stopPolling,
  getSyncState,
  getUnreadCount,
  getDataVersions,
  hasAppUpdate,
  refreshSyncState,
  EVENTS: SYNC_EVENTS,
}
