import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create hoisted mock functions
const { mockDbWhere, mockFindFirst, mockSettingsGetAll, mockInsert, mockDelete } = vi.hoisted(
  () => ({
    mockDbWhere: vi.fn().mockResolvedValue([]),
    mockFindFirst: vi.fn(),
    mockSettingsGetAll: vi.fn().mockResolvedValue({}),
    mockInsert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    mockDelete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  })
)

// Mock the database module
vi.mock('@kawakawa/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockDbWhere,
      }),
    }),
    query: {
      userDiscordProfiles: {
        findFirst: mockFindFirst,
      },
    },
    insert: mockInsert,
    delete: mockDelete,
  },
  userSettings: {
    settingKey: 'settingKey',
    value: 'value',
    userId: 'userId',
  },
  userDiscordProfiles: {
    discordId: 'discordId',
  },
}))

// Mock the settings service
vi.mock('@kawakawa/services/settings', () => ({
  settingsService: {
    getAll: mockSettingsGetAll,
  },
}))

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockImplementation((a, b) => ({ field: a, value: b })),
  and: vi.fn().mockImplementation((...args) => ({ and: args })),
  inArray: vi.fn().mockImplementation((field, values) => ({ inArray: { field, values } })),
}))

// Import after mocks are set up
import {
  getUserSettings,
  getSettingsByDiscordId,
  getDisplaySettings,
  getFioUsernames,
  invalidateCache,
  clearCache,
  setSetting,
  deleteSetting,
} from './userSettings.js'

describe('userSettings', () => {
  beforeEach(() => {
    // Clear all mocks and caches before each test
    vi.clearAllMocks()
    clearCache()
  })

  describe('getUserSettings', () => {
    it('returns default settings when no user overrides exist', async () => {
      mockDbWhere.mockResolvedValueOnce([])

      const result = await getUserSettings(1)

      expect(result).toEqual({
        'discord.locationDisplayMode': 'natural-ids-only',
        'discord.commodityDisplayMode': 'ticker-only',
        'discord.messageVisibility': 'ephemeral',
        'display.locationDisplayMode': 'both',
        'display.commodityDisplayMode': 'both',
        'market.preferredCurrency': 'CIS',
        'market.defaultPriceList': null,
        'market.automaticPricing': false,
        'market.favoritedLocations': [],
        'market.favoritedCommodities': [],
      })
    })

    it('applies user overrides', async () => {
      mockDbWhere.mockResolvedValueOnce([
        { key: 'discord.locationDisplayMode', value: '"names-only"' },
        { key: 'market.preferredCurrency', value: '"NC1"' },
      ])

      const result = await getUserSettings(1)

      expect(result['discord.locationDisplayMode']).toBe('names-only')
      expect(result['market.preferredCurrency']).toBe('NC1')
    })

    it('ignores invalid JSON in user overrides', async () => {
      mockDbWhere.mockResolvedValueOnce([
        { key: 'discord.locationDisplayMode', value: 'invalid-json' },
      ])

      const result = await getUserSettings(1)

      // Should keep default since JSON parse failed
      expect(result['discord.locationDisplayMode']).toBe('natural-ids-only')
    })

    it('ignores unknown setting keys', async () => {
      mockDbWhere.mockResolvedValueOnce([{ key: 'unknown.setting', value: '"some-value"' }])

      const result = await getUserSettings(1)

      expect(result['unknown.setting']).toBeUndefined()
    })

    it('caches results', async () => {
      mockDbWhere.mockResolvedValue([])

      // First call
      await getUserSettings(1)
      // Second call (should use cache)
      await getUserSettings(1)

      // DB should only be called once
      expect(mockDbWhere).toHaveBeenCalledTimes(1)
    })

    it('handles array settings', async () => {
      mockDbWhere.mockResolvedValueOnce([
        { key: 'market.favoritedLocations', value: '["BEN", "MOR"]' },
      ])

      const result = await getUserSettings(1)

      expect(result['market.favoritedLocations']).toEqual(['BEN', 'MOR'])
    })
  })

  describe('getSettingsByDiscordId', () => {
    it('returns null if user is not linked', async () => {
      mockFindFirst.mockResolvedValueOnce(null)

      const result = await getSettingsByDiscordId('123456789')

      expect(result).toBeNull()
    })

    it('returns settings if user is linked', async () => {
      mockFindFirst.mockResolvedValueOnce({
        userId: 1,
      })
      mockDbWhere.mockResolvedValueOnce([])

      const result = await getSettingsByDiscordId('123456789')

      expect(result).not.toBeNull()
      expect(result).toHaveProperty('discord.locationDisplayMode')
    })
  })

  describe('getDisplaySettings', () => {
    it('returns defaults for unlinked user', async () => {
      mockFindFirst.mockResolvedValueOnce(null)

      const result = await getDisplaySettings('123456789')

      expect(result).toEqual({
        locationDisplayMode: 'natural-ids-only',
        commodityDisplayMode: 'ticker-only',
        messageVisibility: 'ephemeral',
        preferredCurrency: 'CIS',
        favoritedLocations: [],
        favoritedCommodities: [],
      })
    })

    it('returns user settings for linked user', async () => {
      mockFindFirst.mockResolvedValueOnce({
        userId: 1,
      })
      mockDbWhere.mockResolvedValueOnce([
        { key: 'discord.locationDisplayMode', value: '"names-only"' },
        { key: 'market.preferredCurrency', value: '"NC1"' },
        { key: 'market.favoritedLocations', value: '["BEN"]' },
      ])

      const result = await getDisplaySettings('123456789')

      expect(result).toEqual({
        locationDisplayMode: 'names-only',
        commodityDisplayMode: 'ticker-only',
        messageVisibility: 'ephemeral',
        preferredCurrency: 'NC1',
        favoritedLocations: ['BEN'],
        favoritedCommodities: [],
      })
    })
  })

  describe('invalidateCache', () => {
    it('invalidates cache for specific user', async () => {
      mockDbWhere.mockResolvedValue([])

      // First call caches
      await getUserSettings(1)
      expect(mockDbWhere).toHaveBeenCalledTimes(1)

      // Invalidate and call again
      invalidateCache(1)
      await getUserSettings(1)

      // Should have made another DB call
      expect(mockDbWhere).toHaveBeenCalledTimes(2)
    })

    it('does not affect other users cache', async () => {
      mockDbWhere.mockResolvedValue([])

      // Cache for user 1 and 2
      await getUserSettings(1)
      await getUserSettings(2)
      expect(mockDbWhere).toHaveBeenCalledTimes(2)

      // Invalidate only user 1
      invalidateCache(1)

      // User 2 should still be cached
      await getUserSettings(2)
      expect(mockDbWhere).toHaveBeenCalledTimes(2)

      // User 1 should require new fetch
      await getUserSettings(1)
      expect(mockDbWhere).toHaveBeenCalledTimes(3)
    })
  })

  describe('clearCache', () => {
    it('clears all user caches', async () => {
      mockDbWhere.mockResolvedValue([])

      // Cache for multiple users
      await getUserSettings(1)
      await getUserSettings(2)
      await getUserSettings(3)
      expect(mockDbWhere).toHaveBeenCalledTimes(3)

      // Clear all caches
      clearCache()

      // All users should require new fetch
      await getUserSettings(1)
      await getUserSettings(2)
      expect(mockDbWhere).toHaveBeenCalledTimes(5)
    })
  })

  describe('getFioUsernames', () => {
    it('returns empty map for empty user list', async () => {
      const result = await getFioUsernames([])
      expect(result).toEqual(new Map())
      expect(mockDbWhere).not.toHaveBeenCalled()
    })

    it('returns FIO usernames for users who have them', async () => {
      mockDbWhere.mockResolvedValueOnce([
        { userId: 1, value: '"GamePlayer1"' },
        { userId: 3, value: '"GamePlayer3"' },
      ])

      const result = await getFioUsernames([1, 2, 3])

      expect(result.get(1)).toBe('GamePlayer1')
      expect(result.get(2)).toBeUndefined()
      expect(result.get(3)).toBe('GamePlayer3')
    })

    it('ignores invalid JSON values', async () => {
      mockDbWhere.mockResolvedValueOnce([
        { userId: 1, value: 'invalid-json' },
        { userId: 2, value: '"ValidUser"' },
      ])

      const result = await getFioUsernames([1, 2])

      expect(result.get(1)).toBeUndefined()
      expect(result.get(2)).toBe('ValidUser')
    })

    it('ignores empty or whitespace-only usernames', async () => {
      mockDbWhere.mockResolvedValueOnce([
        { userId: 1, value: '""' },
        { userId: 2, value: '"   "' },
        { userId: 3, value: '"ValidUser"' },
      ])

      const result = await getFioUsernames([1, 2, 3])

      expect(result.get(1)).toBeUndefined()
      expect(result.get(2)).toBeUndefined()
      expect(result.get(3)).toBe('ValidUser')
    })

    it('deduplicates user IDs', async () => {
      mockDbWhere.mockResolvedValueOnce([{ userId: 1, value: '"GamePlayer"' }])

      const result = await getFioUsernames([1, 1, 1])

      expect(result.get(1)).toBe('GamePlayer')
    })
  })

  describe('setSetting', () => {
    it('inserts a new setting value', async () => {
      await setSetting(1, 'market.preferredCurrency', 'NCC')

      expect(mockInsert).toHaveBeenCalled()
    })

    it('throws error for unknown setting key', async () => {
      await expect(setSetting(1, 'unknownKey', 'value')).rejects.toThrow('Unknown setting key')
    })

    it('invalidates cache after setting', async () => {
      // First cache the settings
      mockDbWhere.mockResolvedValueOnce([])
      await getUserSettings(1)
      expect(mockDbWhere).toHaveBeenCalledTimes(1)

      // Set a setting
      await setSetting(1, 'market.preferredCurrency', 'NCC')

      // Cache should be invalidated, so next call requires DB fetch
      mockDbWhere.mockResolvedValueOnce([])
      await getUserSettings(1)
      expect(mockDbWhere).toHaveBeenCalledTimes(2)
    })
  })

  describe('deleteSetting', () => {
    it('deletes a setting and invalidates cache', async () => {
      // First cache the settings
      mockDbWhere.mockResolvedValueOnce([])
      await getUserSettings(1)
      expect(mockDbWhere).toHaveBeenCalledTimes(1)

      // Delete a setting
      await deleteSetting(1, 'market.preferredCurrency')

      expect(mockDelete).toHaveBeenCalled()

      // Cache should be invalidated, so next call requires DB fetch
      mockDbWhere.mockResolvedValueOnce([])
      await getUserSettings(1)
      expect(mockDbWhere).toHaveBeenCalledTimes(2)
    })
  })
})
