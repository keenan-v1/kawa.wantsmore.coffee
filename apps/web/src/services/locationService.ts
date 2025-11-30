// Location service - mock FIO location data
// Will be replaced with actual FIO API integration

import type { Location, LocationDisplayMode } from '../types'

// Mock location data from Prosperous Universe
const MOCK_LOCATIONS: Location[] = [
  // Stations
  { id: 'ANT', name: 'Antares Station', type: 'Station', systemCode: 'ZV-307', systemName: 'Antares' },
  { id: 'BEN', name: 'Benton Station', type: 'Station', systemCode: 'UV-351', systemName: 'Benton' },
  { id: 'HRT', name: 'Hortus Station', type: 'Station', systemCode: 'VH-331', systemName: 'Hortus' },
  { id: 'MOR', name: 'Moria Station', type: 'Station', systemCode: 'YI-320', systemName: 'Moria' },
  { id: 'PRM', name: 'Prometheus Station', type: 'Station', systemCode: 'ZV-194', systemName: 'Promitor' },

  // CX Stations (Commodity Exchanges)
  { id: 'NC1', name: 'Cibus Nictor', type: 'Station', systemCode: 'XH-886', systemName: 'Nictor' },
  { id: 'IC1', name: 'Fort Ankh', type: 'Station', systemCode: 'XJ-150', systemName: 'Ankh' },
  { id: 'AI1', name: 'Moria Terminal', type: 'Station', systemCode: 'YI-320', systemName: 'Moria' },
  { id: 'CI1', name: 'Hortus Junction', type: 'Station', systemCode: 'VH-331', systemName: 'Hortus' },

  // Planets - various systems
  { id: 'UV-351a', name: 'Benton', type: 'Planet', systemCode: 'UV-351', systemName: 'Benton' },
  { id: 'KW-020c', name: 'Katoa', type: 'Planet', systemCode: 'UV-351', systemName: 'Benton' },
  { id: 'KW-689c', name: 'KW-689c', type: 'Planet', systemCode: 'KW-689', systemName: 'KW-689' },
  { id: 'RC-040c', name: 'RC-040c', type: 'Planet', systemCode: 'RC-040', systemName: 'RC-040' },
  { id: 'ZV-194a', name: 'Promitor', type: 'Planet', systemCode: 'ZV-194', systemName: 'Promitor' },
  { id: 'ZV-194b', name: 'Montem', type: 'Planet', systemCode: 'ZV-194', systemName: 'Promitor' },
  { id: 'YI-320a', name: 'Moria', type: 'Planet', systemCode: 'YI-320', systemName: 'Moria' },
  { id: 'YI-320b', name: 'Harmonia', type: 'Planet', systemCode: 'YI-320', systemName: 'Moria' },
  { id: 'VH-331a', name: 'Hortus', type: 'Planet', systemCode: 'VH-331', systemName: 'Hortus' },
  { id: 'VH-331b', name: 'Dysnomia', type: 'Planet', systemCode: 'VH-331', systemName: 'Hortus' },
  { id: 'ZV-307a', name: 'Antares', type: 'Planet', systemCode: 'ZV-307', systemName: 'Antares' },
  { id: 'ZV-307b', name: 'Kamala', type: 'Planet', systemCode: 'ZV-307', systemName: 'Antares' },
]

export const locationService = {
  // Get all locations
  getAllLocations: (): Location[] => {
    return [...MOCK_LOCATIONS].sort((a, b) => a.name.localeCompare(b.name))
  },

  // Get location by ID
  getLocationById: (id: string): Location | undefined => {
    return MOCK_LOCATIONS.find(l => l.id === id)
  },

  // Get location display with flexible mode
  // names: "Benton Station (Benton)" or "Katoa (Benton)" or "KW-689c (KW-689)"
  // codes: "BEN (UV-351)" or "UV-351a (UV-351)" or "KW-689c (KW-689)"
  // mixed: uses names for named locations, codes for unnamed ones
  getLocationDisplay: (id: string, mode: LocationDisplayMode = 'names'): string => {
    const location = MOCK_LOCATIONS.find(l => l.id === id)
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
  getLocationOptions: (mode: LocationDisplayMode = 'names') => {
    return MOCK_LOCATIONS
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({
        title: locationService.getLocationDisplay(l.id, mode),
        value: l.id
      }))
  },

  // Get locations by type
  getLocationsByType: (type: Location['type']): Location[] => {
    return MOCK_LOCATIONS.filter(l => l.type === type)
  },

  // Get locations by system code
  getLocationsBySystemCode: (systemCode: string): Location[] => {
    return MOCK_LOCATIONS.filter(l => l.systemCode === systemCode)
  },

  // Get all system codes
  getSystemCodes: (): string[] => {
    const systems = new Set(MOCK_LOCATIONS.map(l => l.systemCode))
    return Array.from(systems).sort()
  },

  // Get all system names
  getSystemNames: (): string[] => {
    const systems = new Set(MOCK_LOCATIONS.map(l => l.systemName))
    return Array.from(systems).sort()
  },

  // Get stations only (for dropdowns)
  getStationOptions: (mode: LocationDisplayMode = 'names') => {
    return MOCK_LOCATIONS
      .filter(l => l.type === 'Station')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({
        title: locationService.getLocationDisplay(l.id, mode),
        value: l.id
      }))
  },

  // Get planets only (for dropdowns)
  getPlanetOptions: (mode: LocationDisplayMode = 'names') => {
    return MOCK_LOCATIONS
      .filter(l => l.type === 'Planet')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(l => ({
        title: locationService.getLocationDisplay(l.id, mode),
        value: l.id
      }))
  }
}
