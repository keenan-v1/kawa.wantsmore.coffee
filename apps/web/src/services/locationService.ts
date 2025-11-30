// Location service - fetches from backend API

import type { Location, LocationDisplayMode } from '../types'

// Cache for locations to avoid repeated API calls
let cachedLocations: Location[] | null = null

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
    return data
  } catch (error) {
    console.error('Error fetching locations:', error)
    return []
  }
}

export const locationService = {
  // Get all locations
  getAllLocations: async (): Promise<Location[]> => {
    const locations = await fetchLocations()
    return [...locations].sort((a, b) => a.name.localeCompare(b.name))
  },

  // Get location by ID
  getLocationById: async (id: string): Promise<Location | undefined> => {
    const locations = await fetchLocations()
    return locations.find(l => l.id === id)
  },

  // Get location display with flexible mode
  // names: "Benton Station (Benton)" or "Katoa (Benton)" or "KW-689c (KW-689)"
  // codes: "BEN (UV-351)" or "UV-351a (UV-351)" or "KW-689c (KW-689)"
  // mixed: uses names for named locations, codes for unnamed ones
  getLocationDisplay: (id: string, mode: LocationDisplayMode = 'names'): string => {
    // Synchronous fallback for display - shows ID until data loads
    if (!cachedLocations) {
      return id
    }
    const location = cachedLocations.find(l => l.id === id)
    if (!location) return id

    if (mode === 'codes') {
      return `${location.id} (${location.systemCode})`
    } else if (mode === 'names') {
      return `${location.name} (${location.systemName})`
    } else {
      // mixed mode - use names if available, otherwise codes
      const hasCustomName = location.name !== location.id
      if (hasCustomName) {
        return `${location.name} (${location.systemName})`
      } else {
        return `${location.id} (${location.systemCode})`
      }
    }
  },

  // Get locations for dropdown (returns array of { title, value })
  getLocationOptions: async (mode: LocationDisplayMode = 'names') => {
    const locations = await fetchLocations()
    return locations
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({
        title: locationService.getLocationDisplay(l.id, mode),
        value: l.id
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

  // Get stations only (for dropdowns)
  getStationOptions: async (mode: LocationDisplayMode = 'names') => {
    const locations = await fetchLocations()
    return locations
      .filter(l => l.type === 'Station')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({
        title: locationService.getLocationDisplay(l.id, mode),
        value: l.id
      }))
  },

  // Get planets only (for dropdowns)
  getPlanetOptions: async (mode: LocationDisplayMode = 'names') => {
    const locations = await fetchLocations()
    return locations
      .filter(l => l.type === 'Planet')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({
        title: locationService.getLocationDisplay(l.id, mode),
        value: l.id
      }))
  },

  // Prefetch locations (call this on app startup)
  prefetch: async (): Promise<void> => {
    await fetchLocations()
  },

  // Clear cache (useful for refresh)
  clearCache: (): void => {
    cachedLocations = null
  }
}
