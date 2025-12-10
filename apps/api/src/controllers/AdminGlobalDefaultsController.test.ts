import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminGlobalDefaultsController } from './AdminGlobalDefaultsController.js'
import { db } from '../db/index.js'
import { settingsService } from '../services/settingsService.js'
import * as userSettingsService from '../services/userSettingsService.js'

vi.mock('../db/index.js', () => ({
  db: {
    execute: vi.fn(),
  },
  settings: {},
}))

vi.mock('../services/settingsService.js', () => ({
  settingsService: {
    getAll: vi.fn(),
    setMany: vi.fn(),
    getHistory: vi.fn(),
    invalidateCache: vi.fn(),
  },
}))

vi.mock('../services/userSettingsService.js', () => ({
  clearCache: vi.fn(),
}))

vi.mock('../services/syncService.js', () => ({
  syncService: {
    bumpDataVersion: vi.fn(),
  },
}))

describe('AdminGlobalDefaultsController', () => {
  let controller: AdminGlobalDefaultsController

  const adminUser = { userId: 1, username: 'admin', roles: ['administrator'] }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new AdminGlobalDefaultsController()
  })

  describe('getGlobalDefaults', () => {
    it('should return all configurable settings with defaults', async () => {
      // No admin defaults set
      vi.mocked(settingsService.getAll).mockResolvedValue({})

      const result = await controller.getGlobalDefaults()

      expect(settingsService.getAll).toHaveBeenCalledWith('defaults.')
      expect(result.settings).toBeInstanceOf(Array)
      expect(result.settings.length).toBeGreaterThan(0)

      // Check that we have the expected settings
      const keys = result.settings.map(s => s.key)
      expect(keys).toContain('market.preferredCurrency')
      expect(keys).toContain('general.timezone')
      expect(keys).toContain('display.locationDisplayMode')
      expect(keys).toContain('notifications.browserEnabled')
      expect(keys).toContain('fio.autoSync')

      // Should NOT contain excluded settings
      expect(keys).not.toContain('fio.apiKey')
      expect(keys).not.toContain('fio.username')
      expect(keys).not.toContain('fio.excludedLocations')
      expect(keys).not.toContain('market.favoritedLocations')
      expect(keys).not.toContain('market.favoritedCommodities')
    })

    it('should show admin defaults when they exist', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({
        'defaults.market.preferredCurrency': '"ICA"',
        'defaults.general.timezone': '"America/New_York"',
      })

      const result = await controller.getGlobalDefaults()

      const currencySetting = result.settings.find(s => s.key === 'market.preferredCurrency')
      expect(currencySetting?.adminDefault).toBe('ICA')
      expect(currencySetting?.effectiveDefault).toBe('ICA')

      const timezoneSetting = result.settings.find(s => s.key === 'general.timezone')
      expect(timezoneSetting?.adminDefault).toBe('America/New_York')
    })

    it('should use code default when no admin default exists', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({})

      const result = await controller.getGlobalDefaults()

      const currencySetting = result.settings.find(s => s.key === 'market.preferredCurrency')
      expect(currencySetting?.adminDefault).toBeNull()
      expect(currencySetting?.codeDefault).toBe('CIS')
      expect(currencySetting?.effectiveDefault).toBe('CIS')
    })

    it('should include setting definitions with metadata', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({})

      const result = await controller.getGlobalDefaults()

      const currencySetting = result.settings.find(s => s.key === 'market.preferredCurrency')
      expect(currencySetting?.definition).toBeDefined()
      expect(currencySetting?.definition.label).toBe('Preferred Currency')
      expect(currencySetting?.definition.type).toBe('enum')
      expect(currencySetting?.definition.enumOptions).toContain('CIS')
      expect(currencySetting?.definition.enumOptions).toContain('ICA')
    })
  })

  describe('updateGlobalDefaults', () => {
    it('should update admin defaults for valid settings', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({})
      vi.mocked(settingsService.setMany).mockResolvedValue()

      await controller.updateGlobalDefaults(
        { settings: { 'market.preferredCurrency': 'ICA' } },
        { user: adminUser }
      )

      expect(settingsService.setMany).toHaveBeenCalledWith(
        { 'defaults.market.preferredCurrency': '"ICA"' },
        adminUser.userId
      )
      expect(userSettingsService.clearCache).toHaveBeenCalled()
    })

    it('should update multiple settings at once', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({})
      vi.mocked(settingsService.setMany).mockResolvedValue()

      await controller.updateGlobalDefaults(
        {
          settings: {
            'market.preferredCurrency': 'ICA',
            'market.automaticPricing': true,
            'general.timezone': 'UTC',
          },
        },
        { user: adminUser }
      )

      expect(settingsService.setMany).toHaveBeenCalledWith(
        {
          'defaults.market.preferredCurrency': '"ICA"',
          'defaults.market.automaticPricing': 'true',
          'defaults.general.timezone': '"UTC"',
        },
        adminUser.userId
      )
    })

    it('should reject unknown setting keys', async () => {
      await expect(
        controller.updateGlobalDefaults(
          { settings: { 'unknown.setting': 'value' } },
          { user: adminUser }
        )
      ).rejects.toThrow('Unknown setting: unknown.setting')
    })

    it('should reject excluded (user-specific) settings', async () => {
      await expect(
        controller.updateGlobalDefaults(
          { settings: { 'fio.apiKey': 'secret' } },
          { user: adminUser }
        )
      ).rejects.toThrow('Setting "fio.apiKey" is user-specific and cannot be configured globally')

      await expect(
        controller.updateGlobalDefaults(
          { settings: { 'market.favoritedCommodities': ['RAT'] } },
          { user: adminUser }
        )
      ).rejects.toThrow(
        'Setting "market.favoritedCommodities" is user-specific and cannot be configured globally'
      )
    })

    it('should validate enum values', async () => {
      await expect(
        controller.updateGlobalDefaults(
          { settings: { 'market.preferredCurrency': 'INVALID' } },
          { user: adminUser }
        )
      ).rejects.toThrow('market.preferredCurrency must be one of: ICA, CIS, AIC, NCC')
    })

    it('should validate boolean values', async () => {
      await expect(
        controller.updateGlobalDefaults(
          { settings: { 'market.automaticPricing': 'yes' } },
          { user: adminUser }
        )
      ).rejects.toThrow('market.automaticPricing must be a boolean')
    })

    it('should validate string values', async () => {
      await expect(
        controller.updateGlobalDefaults(
          { settings: { 'general.timezone': 123 } },
          { user: adminUser }
        )
      ).rejects.toThrow('general.timezone must be a string')
    })
  })

  describe('resetGlobalDefault', () => {
    it('should delete the admin default for a setting', async () => {
      vi.mocked(settingsService.getAll).mockResolvedValue({})
      vi.mocked(db.execute).mockResolvedValue([] as any)

      await controller.resetGlobalDefault('market.preferredCurrency')

      expect(db.execute).toHaveBeenCalled()
      expect(settingsService.invalidateCache).toHaveBeenCalled()
      expect(userSettingsService.clearCache).toHaveBeenCalled()
    })

    it('should reject unknown setting keys', async () => {
      await expect(controller.resetGlobalDefault('unknown.setting')).rejects.toThrow(
        'Unknown setting: unknown.setting'
      )
    })

    it('should reject excluded settings', async () => {
      await expect(controller.resetGlobalDefault('fio.apiKey')).rejects.toThrow(
        'Setting "fio.apiKey" is user-specific and cannot be configured globally'
      )
    })
  })

  describe('getSettingHistory', () => {
    it('should return history for a configurable setting', async () => {
      const mockHistory = [
        {
          id: 1,
          key: 'defaults.market.preferredCurrency',
          value: '"ICA"',
          changedByUsername: 'admin',
          effectiveAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]
      vi.mocked(settingsService.getHistory).mockResolvedValue(mockHistory)

      const result = await controller.getSettingHistory('market.preferredCurrency')

      expect(settingsService.getHistory).toHaveBeenCalledWith('defaults.market.preferredCurrency')
      expect(result).toEqual(mockHistory)
    })

    it('should reject unknown setting keys', async () => {
      await expect(controller.getSettingHistory('unknown.setting')).rejects.toThrow(
        'Unknown setting: unknown.setting'
      )
    })

    it('should reject excluded settings', async () => {
      await expect(controller.getSettingHistory('fio.username')).rejects.toThrow(
        'Setting "fio.username" is user-specific and cannot be configured globally'
      )
    })
  })
})
