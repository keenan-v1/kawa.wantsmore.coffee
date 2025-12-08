import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserSettingsController } from './UserSettingsController.js'
import * as userSettingsService from '../services/userSettingsService.js'
import { SETTING_DEFINITIONS } from '@kawakawa/types/settings'

vi.mock('../services/userSettingsService.js', () => ({
  getAllSettings: vi.fn(),
  setSettings: vi.fn(),
  resetSetting: vi.fn(),
  resetAllSettings: vi.fn(),
}))

describe('UserSettingsController', () => {
  let controller: UserSettingsController
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: [] } }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new UserSettingsController()
  })

  describe('getSettings', () => {
    it('should return settings with values and definitions', async () => {
      const mockValues = {
        'display.preferredCurrency': 'ICA',
        'display.locationDisplayMode': 'both',
        'notifications.browserEnabled': true,
      }
      vi.mocked(userSettingsService.getAllSettings).mockResolvedValueOnce(mockValues)

      const result = await controller.getSettings(mockRequest)

      expect(result.values).toEqual(mockValues)
      expect(result.definitions).toBeDefined()
      expect(result.definitions['display.preferredCurrency']).toBeDefined()
      expect(userSettingsService.getAllSettings).toHaveBeenCalledWith(1)
    })

    it('should include all setting definitions', async () => {
      vi.mocked(userSettingsService.getAllSettings).mockResolvedValueOnce({})

      const result = await controller.getSettings(mockRequest)

      // Verify all definitions are present
      for (const key of Object.keys(SETTING_DEFINITIONS)) {
        expect(result.definitions[key]).toBeDefined()
      }
    })
  })

  describe('updateSettings', () => {
    it('should update settings and return updated values', async () => {
      const settingsToUpdate = {
        'display.preferredCurrency': 'NCC',
        'notifications.browserEnabled': true,
      }
      const updatedValues = {
        'display.preferredCurrency': 'NCC',
        'display.locationDisplayMode': 'both',
        'notifications.browserEnabled': true,
      }

      vi.mocked(userSettingsService.setSettings).mockResolvedValueOnce()
      vi.mocked(userSettingsService.getAllSettings).mockResolvedValueOnce(updatedValues)

      const result = await controller.updateSettings({ settings: settingsToUpdate }, mockRequest)

      expect(userSettingsService.setSettings).toHaveBeenCalledWith(1, settingsToUpdate)
      expect(result.values).toEqual(updatedValues)
    })

    it('should reject invalid settings object', async () => {
      const setSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.updateSettings({ settings: null as any }, mockRequest)
      ).rejects.toThrow('settings must be an object')

      expect(setSpy).toHaveBeenCalledWith(400)
    })

    it('should handle validation errors from service', async () => {
      vi.mocked(userSettingsService.setSettings).mockRejectedValueOnce(
        new Error('display.preferredCurrency must be one of: ICA, CIS, AIC, NCC')
      )

      const setSpy = vi.spyOn(controller, 'setStatus')

      await expect(
        controller.updateSettings(
          { settings: { 'display.preferredCurrency': 'INVALID' } },
          mockRequest
        )
      ).rejects.toThrow('display.preferredCurrency must be one of: ICA, CIS, AIC, NCC')

      expect(setSpy).toHaveBeenCalledWith(400)
    })
  })

  describe('resetSetting', () => {
    it('should reset setting and return updated values', async () => {
      const resetValues = {
        'display.preferredCurrency': 'CIS', // back to default
        'display.locationDisplayMode': 'both',
      }

      vi.mocked(userSettingsService.resetSetting).mockResolvedValueOnce()
      vi.mocked(userSettingsService.getAllSettings).mockResolvedValueOnce(resetValues)

      const result = await controller.resetSetting('display.preferredCurrency', mockRequest)

      expect(userSettingsService.resetSetting).toHaveBeenCalledWith(1, 'display.preferredCurrency')
      expect(result.values).toEqual(resetValues)
    })

    it('should handle unknown setting key error', async () => {
      vi.mocked(userSettingsService.resetSetting).mockRejectedValueOnce(
        new Error('Unknown setting: invalid.key')
      )

      const setSpy = vi.spyOn(controller, 'setStatus')

      await expect(controller.resetSetting('invalid.key', mockRequest)).rejects.toThrow(
        'Unknown setting: invalid.key'
      )

      expect(setSpy).toHaveBeenCalledWith(400)
    })
  })

  describe('resetAllSettings', () => {
    it('should reset all settings and return defaults', async () => {
      const defaultValues = {
        'display.preferredCurrency': 'CIS',
        'display.locationDisplayMode': 'both',
        'display.commodityDisplayMode': 'both',
        'notifications.browserEnabled': false,
        'fio.autoSync': true,
      }

      vi.mocked(userSettingsService.resetAllSettings).mockResolvedValueOnce()
      vi.mocked(userSettingsService.getAllSettings).mockResolvedValueOnce(defaultValues)

      const result = await controller.resetAllSettings(mockRequest)

      expect(userSettingsService.resetAllSettings).toHaveBeenCalledWith(1)
      expect(result.values).toEqual(defaultValues)
    })
  })
})
