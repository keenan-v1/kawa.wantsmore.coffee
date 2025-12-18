// Location service - fetches from backend API with localStorage persistence

import type { Location, LocationDisplayMode } from '../types'

// Cache keys and TTL
const CACHE_KEY = 'kawakawa:locations'
const USER_LOCATIONS_KEY = 'kawakawa:userLocations'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const USER_LOCATIONS_TTL_MS = 5 * 60 * 1000 // 5 minutes (user inventory can change)

interface CacheEntry {
  data: Location[]
  timestamp: number
}

interface UserLocationInfo {
  locationId: string
  storageTypes: string[]
}

interface UserLocationsCacheEntry {
  data: UserLocationInfo[]
  timestamp: number
}

// In-memory cache for fast access during session
let cachedLocations: Location[] | null = null
// User's storage locations (where they have inventory) with storage types
let cachedUserLocations: Map<string, string[]> | null = null
let userLocationsLoadedAt = 0

// Load from localStorage on module init
const loadFromStorage = (): Location[] | null => {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (!stored) return null

    const entry: CacheEntry = JSON.parse(stored)
    const age = Date.now() - entry.timestamp

    if (age > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    return entry.data
  } catch {
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}

// Save to localStorage
const saveToStorage = (data: Location[]): void => {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch (error) {
    console.warn('Failed to cache locations to localStorage:', error)
  }
}

// Initialize from localStorage
cachedLocations = loadFromStorage()

// Fetch locations from backend API
const fetchLocations = async (): Promise<Location[]> => {
  if (cachedLocations) {
    return cachedLocations
  }

  try {
    const response = await fetch('/api/locations')
    if (!response.ok) {
      throw new Error(`Failed to fetch locations: ${response.statusText}`)
    }
    const data = await response.json()
    cachedLocations = data
    saveToStorage(data)
    return data
  } catch (error) {
    console.error('Error fetching locations:', error)
    return []
  }
}

export const locationService = {
  // Get all locations (async)
  getAllLocations: async (): Promise<Location[]> => {
    const locations = await fetchLocations()
    return [...locations].sort((a, b) => a.name.localeCompare(b.name))
  },

  // Get all locations from cache (synchronous, returns empty array if not loaded)
  getAllLocationsSync: (): Location[] => {
    if (!cachedLocations) return []
    return [...cachedLocations].sort((a, b) => a.name.localeCompare(b.name))
  },

  // Get location by ID
  getLocationById: async (id: string): Promise<Location | undefined> => {
    const locations = await fetchLocations()
    return locations.find(l => l.id === id)
  },

  // Get location display with flexible mode
  // For planets:
  //   names-only: "Katoa"
  //   natural-ids-only: "UV-351a"
  //   both: "Katoa (UV-351a)"
  // For stations:
  //   names-only: "Benten Station"
  //   natural-ids-only: "BEN"
  //   both: "Benten Station (BEN)"
  getLocationDisplay: (id: string, mode: LocationDisplayMode = 'names-only'): string => {
    // Synchronous fallback for display - shows ID until data loads
    if (!cachedLocations) {
      return id
    }
    const location = cachedLocations.find(l => l.id === id)
    if (!location) return id

    if (mode === 'natural-ids-only') {
      // Show only the natural ID (destination code)
      return location.id
    } else if (mode === 'names-only') {
      // Show only the name
      return location.name
    } else {
      // both: show name with natural ID in parentheses
      return `${location.name} (${location.id})`
    }
  },

  // Get locations for dropdown (returns array of { title, value })
  getLocationOptions: async (mode: LocationDisplayMode = 'names-only') => {
    const locations = await fetchLocations()
    return locations
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({
        title: locationService.getLocationDisplay(l.id, mode),
        value: l.id,
      }))
  },

  // Get locations by type
  getLocationsByType: async (type: Location['type']): Promise<Location[]> => {
    const locations = await fetchLocations()
    return locations.filter(l => l.type === type)
  },

  // Get locations by system code
  getLocationsBySystemCode: async (systemCode: string): Promise<Location[]> => {
    const locations = await fetchLocations()
    return locations.filter(l => l.systemCode === systemCode)
  },

  // Get all system codes
  getSystemCodes: async (): Promise<string[]> => {
    const locations = await fetchLocations()
    const systems = new Set(locations.map(l => l.systemCode))
    return Array.from(systems).sort()
  },

  // Get all system names
  getSystemNames: async (): Promise<string[]> => {
    const locations = await fetchLocations()
    const systems = new Set(locations.map(l => l.systemName))
    return Array.from(systems).sort()
  },

  // Get location type by ID (synchronous, uses cache)
  getLocationType: (id: string): Location['type'] | null => {
    if (!cachedLocations) return null
    const location = cachedLocations.find(l => l.id === id)
    return location?.type ?? null
  },

  // Get stations only (for dropdowns)
  getStationOptions: async (mode: LocationDisplayMode = 'names-only') => {
    const locations = await fetchLocations()
    return locations
      .filter(l => l.type === 'Station')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({
        title: locationService.getLocationDisplay(l.id, mode),
        value: l.id,
      }))
  },

  // Get planets only (for dropdowns)
  getPlanetOptions: async (mode: LocationDisplayMode = 'names-only') => {
    const locations = await fetchLocations()
    return locations
      .filter(l => l.type === 'Planet')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({
        title: locationService.getLocationDisplay(l.id, mode),
        value: l.id,
      }))
  },

  // Prefetch locations (call this on app startup)
  prefetch: async (): Promise<void> => {
    await fetchLocations()
  },

  // Clear cache (useful for refresh)
  clearCache: (): void => {
    cachedLocations = null
    cachedUserLocations = null
    userLocationsLoadedAt = 0
    localStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(USER_LOCATIONS_KEY)
  },

  // Load user's storage locations (where they have inventory) with storage types
  loadUserLocations: async (): Promise<Map<string, string[]>> => {
    // Check if cache is still valid
    const age = Date.now() - userLocationsLoadedAt
    if (cachedUserLocations && age < USER_LOCATIONS_TTL_MS) {
      return cachedUserLocations
    }

    // Try loading from localStorage first
    try {
      const stored = localStorage.getItem(USER_LOCATIONS_KEY)
      if (stored) {
        const entry: UserLocationsCacheEntry = JSON.parse(stored)
        const storedAge = Date.now() - entry.timestamp
        if (storedAge < USER_LOCATIONS_TTL_MS) {
          cachedUserLocations = new Map(entry.data.map(l => [l.locationId, l.storageTypes]))
          userLocationsLoadedAt = entry.timestamp
          return cachedUserLocations
        }
      }
    } catch {
      // Ignore localStorage errors
    }

    // Fetch from API
    try {
      const response = await fetch('/api/fio/inventory/locations', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('jwt') ?? ''}`,
        },
      })
      if (!response.ok) {
        throw new Error('Failed to fetch user locations')
      }
      const data = await response.json()
      const locations: UserLocationInfo[] = data.locations ?? []

      // Cache the result as Map<locationId, storageTypes>
      cachedUserLocations = new Map(locations.map(l => [l.locationId, l.storageTypes]))
      userLocationsLoadedAt = Date.now()

      // Save to localStorage
      try {
        const entry: UserLocationsCacheEntry = {
          data: locations,
          timestamp: userLocationsLoadedAt,
        }
        localStorage.setItem(USER_LOCATIONS_KEY, JSON.stringify(entry))
      } catch {
        // Ignore localStorage errors
      }

      return cachedUserLocations
    } catch {
      // Return empty map on error
      return new Map()
    }
  },

  // Check if a location is a user location (synchronous, uses cache)
  isUserLocation: (id: string): boolean => {
    return cachedUserLocations?.has(id) ?? false
  },

  // Get storage types for a user location (synchronous, uses cache)
  getStorageTypes: (id: string): string[] | undefined => {
    return cachedUserLocations?.get(id)
  },

  // Get all user location IDs (synchronous, uses cache)
  getUserLocationIds: (): Set<string> => {
    return cachedUserLocations ? new Set(cachedUserLocations.keys()) : new Set()
  },
}
