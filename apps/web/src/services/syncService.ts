// Sync service - handles polling for sync state and cache invalidation

import type { SyncState, DataVersions, SyncDataKey } from '@kawakawa/types'
import { locationService } from './locationService'
import { commodityService } from './commodityService'

// Polling interval (30 seconds)
const POLL_INTERVAL = 30 * 1000

// App version baked in at build time (commit SHA)
// This allows reliable version comparison without storage
const BUILD_VERSION = __APP_VERSION__

// Current sync state
let currentSyncState: SyncState | null = null
let pollIntervalId: ReturnType<typeof setInterval> | null = null
let isPolling = false
let versionMismatchNotified = false

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

  // Check for app version mismatch - compare API version against build version
  // In dev mode, BUILD_VERSION is 'dev' so we skip the check
  if (
    BUILD_VERSION !== 'dev' &&
    newState.appVersion !== BUILD_VERSION &&
    !versionMismatchNotified
  ) {
    versionMismatchNotified = true
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENTS.APP_VERSION_CHANGED, {
        detail: {
          newVersion: newState.appVersion,
          oldVersion: BUILD_VERSION,
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
  return BUILD_VERSION !== 'dev' && currentSyncState?.appVersion !== BUILD_VERSION
}

// Get the build version
export function getBuildVersion(): string {
  return BUILD_VERSION
}

// Force refresh sync state (useful after login)
export async function refreshSyncState(): Promise<SyncState | null> {
  const state = await fetchSyncState()
  if (state) {
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
  getBuildVersion,
  refreshSyncState,
  EVENTS: SYNC_EVENTS,
}
