import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as userSettingsService from './userSettingsService.js'
import { SETTING_DEFINITIONS } from '@kawakawa/types/settings'

// Mock the database
vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
  userSettings: {
    id: 'id',
    userId: 'userId',
    settingKey: 'settingKey',
    value: 'value',
    updatedAt: 'updatedAt',
  },
}))

// Mock the settingsService for admin defaults
vi.mock('./settingsService.js', () => ({
  settingsService: {
    getAll: vi.fn().mockResolvedValue({}),
  },
}))

import { db } from '../db/index.js'
import { settingsService } from './settingsService.js'

describe('userSettingsService', () => {
  let mockSelect: ReturnType<typeof vi.fn>
  let mockFrom: ReturnType<typeof vi.fn>
  let mockWhere: ReturnType<typeof vi.fn>
  let mockInsert: ReturnType<typeof vi.fn>
  let mockValues: ReturnType<typeof vi.fn>
  let mockOnConflictDoUpdate: ReturnType<typeof vi.fn>
  let mockDelete: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Clear cache before each test
    userSettingsService.clearCache()
    userSettingsService.invalidateAdminDefaultsCache()
    // Reset settingsService mock to return empty admin defaults
    vi.mocked(settingsService.getAll).mockResolvedValue({})

    // Setup mock chain for select
    mockWhere = vi.fn().mockResolvedValue([])
    mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
    mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

    // Setup mock chain for insert
    mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
    mockInsert = vi.fn().mockReturnValue({ values: mockValues })

    // Setup mock chain for delete
    mockDelete = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })

    vi.mocked(db.select).mockImplementation(mockSelect as any)
    vi.mocked(db.insert).mockImplementation(mockInsert as any)
    vi.mocked(db.delete).mockImplementation(mockDelete as any)
  })

  describe('getAllSettings', () => {
    it('should return defaults when no user overrides exist', async () => {
      mockWhere.mockResolvedValueOnce([])

      const result = await userSettingsService.getAllSettings(1)

      // Should have all default values
      expect(result['market.preferredCurrency']).toBe('CIS')
      expect(result['display.locationDisplayMode']).toBe('both')
      expect(result['display.commodityDisplayMode']).toBe('both')
      expect(result['notifications.browserEnabled']).toBe(false)
      expect(result['notifications.reservationPlaced']).toBe(true)
      expect(result['fio.autoSync']).toBe(true)
      expect(result['fio.excludedLocations']).toEqual([])
    })

    it('should override defaults with user values', async () => {
      mockWhere.mockResolvedValueOnce([
        { key: 'market.preferredCurrency', value: '"ICA"' },
        { key: 'notifications.browserEnabled', value: 'true' },
      ])

      const result = await userSettingsService.getAllSettings(1)

      // Overridden values
      expect(result['market.preferredCurrency']).toBe('ICA')
      expect(result['notifications.browserEnabled']).toBe(true)
      // Default values preserved
      expect(result['display.locationDisplayMode']).toBe('both')
      expect(result['fio.autoSync']).toBe(true)
    })

    it('should use cache on subsequent calls', async () => {
      mockWhere.mockResolvedValueOnce([{ key: 'market.preferredCurrency', value: '"CIS"' }])

      // First call
      await userSettingsService.getAllSettings(1)
      // Second call should use cache
      const result = await userSettingsService.getAllSettings(1)

      expect(result['market.preferredCurrency']).toBe('CIS')
      // Database should only be called once
      expect(mockSelect).toHaveBeenCalledTimes(1)
    })

    it('should have separate caches per user', async () => {
      mockWhere
        .mockResolvedValueOnce([{ key: 'market.preferredCurrency', value: '"ICA"' }])
        .mockResolvedValueOnce([{ key: 'market.preferredCurrency', value: '"NCC"' }])

      const result1 = await userSettingsService.getAllSettings(1)
      const result2 = await userSettingsService.getAllSettings(2)

      expect(result1['market.preferredCurrency']).toBe('ICA')
      expect(result2['market.preferredCurrency']).toBe('NCC')
      expect(mockSelect).toHaveBeenCalledTimes(2)
    })

    it('should ignore unknown setting keys', async () => {
      mockWhere.mockResolvedValueOnce([
        { key: 'unknown.setting', value: '"ignored"' },
        { key: 'market.preferredCurrency', value: '"ICA"' },
      ])

      const result = await userSettingsService.getAllSettings(1)

      expect(result['unknown.setting']).toBeUndefined()
      expect(result['market.preferredCurrency']).toBe('ICA')
    })

    it('should use default for invalid JSON values', async () => {
      // Spy on console.warn
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      mockWhere.mockResolvedValueOnce([{ key: 'market.preferredCurrency', value: 'invalid-json' }])

      const result = await userSettingsService.getAllSettings(1)

      expect(result['market.preferredCurrency']).toBe('CIS') // default
      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
    })
  })

  describe('getSetting', () => {
    it('should return single setting value', async () => {
      mockWhere.mockResolvedValueOnce([{ key: 'market.preferredCurrency', value: '"ICA"' }])

      const result = await userSettingsService.getSetting(1, 'market.preferredCurrency')

      expect(result).toBe('ICA')
    })

    it('should return default for unset setting', async () => {
      mockWhere.mockResolvedValueOnce([])

      const result = await userSettingsService.getSetting(1, 'market.preferredCurrency')

      expect(result).toBe('CIS')
    })
  })

  describe('setSetting', () => {
    it('should save valid setting value', async () => {
      await userSettingsService.setSetting(1, 'market.preferredCurrency', 'ICA')

      expect(mockInsert).toHaveBeenCalled()
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          settingKey: 'market.preferredCurrency',
          value: '"ICA"',
        })
      )
    })

    it('should throw for unknown setting key', async () => {
      await expect(userSettingsService.setSetting(1, 'unknown.key', 'value')).rejects.toThrow(
        'Unknown setting: unknown.key'
      )
    })

    it('should validate boolean type', async () => {
      await expect(
        userSettingsService.setSetting(1, 'notifications.browserEnabled', 'not-a-boolean')
      ).rejects.toThrow('notifications.browserEnabled must be a boolean')
    })

    it('should validate enum options', async () => {
      await expect(
        userSettingsService.setSetting(1, 'market.preferredCurrency', 'INVALID')
      ).rejects.toThrow('market.preferredCurrency must be one of: ICA, CIS, AIC, NCC')
    })

    it('should validate string array type', async () => {
      await expect(
        userSettingsService.setSetting(1, 'fio.excludedLocations', 'not-an-array')
      ).rejects.toThrow('fio.excludedLocations must be an array of strings')

      await expect(
        userSettingsService.setSetting(1, 'fio.excludedLocations', [1, 2, 3])
      ).rejects.toThrow('fio.excludedLocations must be an array of strings')
    })

    it('should accept valid string array', async () => {
      await userSettingsService.setSetting(1, 'fio.excludedLocations', ['LOC1', 'LOC2'])

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          value: '["LOC1","LOC2"]',
        })
      )
    })

    it('should invalidate cache after setting', async () => {
      // Populate cache
      mockWhere.mockResolvedValueOnce([])
      await userSettingsService.getAllSettings(1)
      expect(mockSelect).toHaveBeenCalledTimes(1)

      // Set new value
      await userSettingsService.setSetting(1, 'market.preferredCurrency', 'ICA')

      // Next call should hit database
      mockWhere.mockResolvedValueOnce([{ key: 'market.preferredCurrency', value: '"ICA"' }])
      await userSettingsService.getAllSettings(1)
      expect(mockSelect).toHaveBeenCalledTimes(2)
    })
  })

  describe('setSettings', () => {
    it('should set multiple settings', async () => {
      await userSettingsService.setSettings(1, {
        'market.preferredCurrency': 'ICA',
        'notifications.browserEnabled': true,
      })

      expect(mockInsert).toHaveBeenCalledTimes(2)
    })

    it('should validate all settings before saving any', async () => {
      await expect(
        userSettingsService.setSettings(1, {
          'market.preferredCurrency': 'INVALID',
          'notifications.browserEnabled': true,
        })
      ).rejects.toThrow('market.preferredCurrency must be one of')

      // Should not have called insert due to validation failure
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should throw for unknown settings', async () => {
      await expect(
        userSettingsService.setSettings(1, {
          'unknown.key': 'value',
        })
      ).rejects.toThrow('Unknown setting: unknown.key')
    })
  })

  describe('resetSetting', () => {
    it('should delete user setting override', async () => {
      await userSettingsService.resetSetting(1, 'market.preferredCurrency')

      expect(mockDelete).toHaveBeenCalled()
    })

    it('should throw for unknown setting key', async () => {
      await expect(userSettingsService.resetSetting(1, 'unknown.key')).rejects.toThrow(
        'Unknown setting: unknown.key'
      )
    })

    it('should invalidate cache after reset', async () => {
      // Populate cache
      mockWhere.mockResolvedValueOnce([{ key: 'market.preferredCurrency', value: '"ICA"' }])
      await userSettingsService.getAllSettings(1)
      expect(mockSelect).toHaveBeenCalledTimes(1)

      // Reset
      await userSettingsService.resetSetting(1, 'market.preferredCurrency')

      // Next call should hit database
      mockWhere.mockResolvedValueOnce([])
      await userSettingsService.getAllSettings(1)
      expect(mockSelect).toHaveBeenCalledTimes(2)
    })
  })

  describe('resetAllSettings', () => {
    it('should delete all user settings', async () => {
      await userSettingsService.resetAllSettings(1)

      expect(mockDelete).toHaveBeenCalled()
    })

    it('should invalidate cache', async () => {
      // Populate cache
      mockWhere.mockResolvedValueOnce([])
      await userSettingsService.getAllSettings(1)
      expect(mockSelect).toHaveBeenCalledTimes(1)

      // Reset all
      await userSettingsService.resetAllSettings(1)

      // Next call should hit database
      mockWhere.mockResolvedValueOnce([])
      await userSettingsService.getAllSettings(1)
      expect(mockSelect).toHaveBeenCalledTimes(2)
    })
  })

  describe('cache management', () => {
    it('invalidateCache should clear specific user cache', async () => {
      // Populate caches for two users
      mockWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      await userSettingsService.getAllSettings(1)
      await userSettingsService.getAllSettings(2)
      expect(mockSelect).toHaveBeenCalledTimes(2)

      // Invalidate user 1's cache
      userSettingsService.invalidateCache(1)

      // User 1 should hit DB, user 2 should use cache
      mockWhere.mockResolvedValueOnce([])
      await userSettingsService.getAllSettings(1)
      await userSettingsService.getAllSettings(2)
      expect(mockSelect).toHaveBeenCalledTimes(3)
    })

    it('clearCache should clear all caches', async () => {
      // Populate caches
      mockWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      await userSettingsService.getAllSettings(1)
      await userSettingsService.getAllSettings(2)
      expect(mockSelect).toHaveBeenCalledTimes(2)

      // Clear all
      userSettingsService.clearCache()

      // Both should hit DB
      mockWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      await userSettingsService.getAllSettings(1)
      await userSettingsService.getAllSettings(2)
      expect(mockSelect).toHaveBeenCalledTimes(4)
    })
  })

  describe('setting definitions coverage', () => {
    it('should have definitions for all expected settings', () => {
      // Verify all expected settings exist
      const expectedKeys = [
        // General settings
        'general.timezone',
        'general.datetimeFormat',
        'general.numberFormat',
        // Display settings
        'display.locationDisplayMode',
        'display.commodityDisplayMode',
        // Market settings
        'market.preferredCurrency',
        'market.defaultPriceList',
        'market.automaticPricing',
        'market.favoritedLocations',
        'market.favoritedCommodities',
        // Notification settings
        'notifications.browserEnabled',
        'notifications.reservationPlaced',
        'notifications.reservationStatusChange',
        // FIO settings
        'fio.username',
        'fio.apiKey',
        'fio.autoSync',
        'fio.excludedLocations',
      ]

      for (const key of expectedKeys) {
        expect(SETTING_DEFINITIONS).toHaveProperty(key)
      }
    })

    it('all definitions should have required fields', () => {
      for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
        expect(def.key).toBe(key)
        expect(def.type).toBeDefined()
        expect(def.defaultValue).toBeDefined()
        expect(def.category).toBeDefined()
        expect(def.label).toBeDefined()
        expect(def.description).toBeDefined()
      }
    })
  })

  describe('admin defaults integration', () => {
    it('should apply admin defaults over code defaults', async () => {
      // Admin has set a different default currency
      vi.mocked(settingsService.getAll).mockResolvedValue({
        'defaults.market.preferredCurrency': '"ICA"',
      })
      // No user overrides
      mockWhere.mockResolvedValueOnce([])

      const result = await userSettingsService.getAllSettings(1)

      // Admin default should take precedence over code default
      expect(result['market.preferredCurrency']).toBe('ICA')
      // Other settings should still use code defaults
      expect(result['display.locationDisplayMode']).toBe('both')
    })

    it('should apply user overrides over admin defaults', async () => {
      // Admin has set a default currency
      vi.mocked(settingsService.getAll).mockResolvedValue({
        'defaults.market.preferredCurrency': '"ICA"',
      })
      // User has their own preference
      mockWhere.mockResolvedValueOnce([{ key: 'market.preferredCurrency', value: '"NCC"' }])

      const result = await userSettingsService.getAllSettings(1)

      // User override should take precedence over admin default
      expect(result['market.preferredCurrency']).toBe('NCC')
    })

    it('should apply multiple admin defaults', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({
        'defaults.market.preferredCurrency': '"AIC"',
        'defaults.general.timezone': '"America/New_York"',
        'defaults.market.automaticPricing': 'true',
      })
      mockWhere.mockResolvedValueOnce([])

      const result = await userSettingsService.getAllSettings(1)

      expect(result['market.preferredCurrency']).toBe('AIC')
      expect(result['general.timezone']).toBe('America/New_York')
      expect(result['market.automaticPricing']).toBe(true)
    })

    it('should ignore invalid JSON in admin defaults', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({
        'defaults.market.preferredCurrency': 'invalid-json',
      })
      mockWhere.mockResolvedValueOnce([])

      const result = await userSettingsService.getAllSettings(1)

      // Should fall back to code default
      expect(result['market.preferredCurrency']).toBe('CIS')
    })

    it('should cache admin defaults', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({
        'defaults.market.preferredCurrency': '"ICA"',
      })
      mockWhere.mockResolvedValue([])

      // First call
      await userSettingsService.getAllSettings(1)
      // Second call with different user
      await userSettingsService.getAllSettings(2)

      // settingsService.getAll should only be called once due to caching
      expect(settingsService.getAll).toHaveBeenCalledTimes(1)
    })

    it('invalidateAdminDefaultsCache should clear admin defaults cache', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({
        'defaults.market.preferredCurrency': '"ICA"',
      })
      mockWhere.mockResolvedValue([])

      // First call
      await userSettingsService.getAllSettings(1)
      expect(settingsService.getAll).toHaveBeenCalledTimes(1)

      // Invalidate admin cache
      userSettingsService.invalidateAdminDefaultsCache()

      // Second call should fetch admin defaults again
      await userSettingsService.getAllSettings(2)
      expect(settingsService.getAll).toHaveBeenCalledTimes(2)
    })
  })
})
