import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  formatLocation,
  resolveLocation,
  getLocation,
  getAllLocations,
  clearLocationCache,
  _setCache,
  type LocationInfo,
} from './locationService.js'

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockResolvedValue([]),
  },
  fioLocations: {},
}))

describe('locationService', () => {
  const mockLocations: LocationInfo[] = [
    { naturalId: 'BEN', name: 'Benten', type: 'STATION' },
    { naturalId: 'MOR', name: 'Moria', type: 'STATION' },
    { naturalId: 'UV-351a', name: 'Proxion', type: 'PLANET' },
    { naturalId: 'ANT', name: 'Antares', type: 'STATION' },
  ]

  beforeEach(() => {
    // Set up mock cache before each test (indexed by both naturalId and name)
    const cache = new Map<string, LocationInfo>()
    for (const l of mockLocations) {
      cache.set(l.naturalId.toUpperCase(), l)
      cache.set(l.name.toUpperCase(), l)
    }
    _setCache(cache)
  })

  describe('formatLocation', () => {
    it('formats with both mode (default)', async () => {
      const result = await formatLocation('BEN')
      expect(result).toBe('Benten (BEN)')
    })

    it('formats with natural-ids-only mode', async () => {
      const result = await formatLocation('BEN', 'natural-ids-only')
      expect(result).toBe('BEN')
    })

    it('formats with names-only mode', async () => {
      const result = await formatLocation('BEN', 'names-only')
      expect(result).toBe('Benten')
    })

    it('formats with both mode explicitly', async () => {
      const result = await formatLocation('MOR', 'both')
      expect(result).toBe('Moria (MOR)')
    })

    it('returns input as-is for unknown location', async () => {
      const result = await formatLocation('UNKNOWN')
      expect(result).toBe('UNKNOWN')
    })

    it('is case-insensitive for lookup', async () => {
      const result = await formatLocation('ben', 'both')
      expect(result).toBe('Benten (BEN)')
    })

    it('handles planet locations', async () => {
      const result = await formatLocation('UV-351a')
      expect(result).toBe('Proxion (UV-351a)')
    })
  })

  describe('resolveLocation', () => {
    it('resolves by naturalId (lowercase)', async () => {
      const result = await resolveLocation('ben')
      expect(result).toEqual({ naturalId: 'BEN', name: 'Benten', type: 'STATION' })
    })

    it('resolves by naturalId (uppercase)', async () => {
      const result = await resolveLocation('BEN')
      expect(result).toEqual({ naturalId: 'BEN', name: 'Benten', type: 'STATION' })
    })

    it('resolves by name (case-insensitive)', async () => {
      const result = await resolveLocation('benten')
      expect(result).toEqual({ naturalId: 'BEN', name: 'Benten', type: 'STATION' })
    })

    it('resolves by name (exact case)', async () => {
      const result = await resolveLocation('Moria')
      expect(result).toEqual({ naturalId: 'MOR', name: 'Moria', type: 'STATION' })
    })

    it('returns null for invalid location', async () => {
      const result = await resolveLocation('INVALID')
      expect(result).toBeNull()
    })

    it('returns null for empty string', async () => {
      const result = await resolveLocation('')
      expect(result).toBeNull()
    })

    it('does not match partial names', async () => {
      // "Ben" matches "BEN" due to case-insensitive matching
      // Only exact matches work, so "Bent" should not match "Benten"
      const result = await resolveLocation('Bent')
      expect(result).toBeNull()
    })

    it('resolves planet IDs with special characters', async () => {
      const result = await resolveLocation('uv-351a')
      expect(result).toEqual({ naturalId: 'UV-351a', name: 'Proxion', type: 'PLANET' })
    })
  })

  describe('getLocation', () => {
    it('returns full location info for valid ID', async () => {
      const result = await getLocation('BEN')
      expect(result).toEqual({
        naturalId: 'BEN',
        name: 'Benten',
        type: 'STATION',
      })
    })

    it('returns null for invalid ID', async () => {
      const result = await getLocation('INVALID')
      expect(result).toBeNull()
    })

    it('is case-insensitive', async () => {
      const result = await getLocation('mor')
      expect(result).toEqual({
        naturalId: 'MOR',
        name: 'Moria',
        type: 'STATION',
      })
    })

    it('can lookup by name', async () => {
      const result = await getLocation('Antares')
      expect(result).toEqual({
        naturalId: 'ANT',
        name: 'Antares',
        type: 'STATION',
      })
    })
  })

  describe('getAllLocations', () => {
    it('returns all unique locations', async () => {
      const result = await getAllLocations()
      expect(result).toHaveLength(4)
      expect(result.map(l => l.naturalId).sort()).toEqual(['ANT', 'BEN', 'MOR', 'UV-351a'])
    })

    it('returns empty array when cache is empty', async () => {
      _setCache(new Map())
      const result = await getAllLocations()
      expect(result).toEqual([])
    })

    it('deduplicates locations indexed by both ID and name', async () => {
      // Each location is indexed twice (by ID and name), but getAllLocations should dedupe
      const result = await getAllLocations()
      const ids = result.map(l => l.naturalId)
      const uniqueIds = [...new Set(ids)]
      expect(ids).toEqual(uniqueIds)
    })
  })

  describe('clearLocationCache', () => {
    it('clears the cache', async () => {
      // Verify cache is populated
      const before = await getLocation('BEN')
      expect(before).not.toBeNull()

      // Clear and set to null
      clearLocationCache()
      _setCache(null)

      // Cache should be null, next call will try to load from DB (which is mocked to return empty)
      const after = await getLocation('BEN')
      expect(after).toBeNull()
    })
  })
})
