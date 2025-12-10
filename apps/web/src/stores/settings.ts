// Settings store for managing user preferences
// Settings are cached in memory and localStorage with invalidation on update

import { ref, computed } from 'vue'
import {
  SETTING_DEFINITIONS,
  SETTING_CATEGORIES,
  SETTING_CATEGORY_INFO,
  type SettingKey,
} from '@kawakawa/types/settings'
import type { Currency, LocationDisplayMode, CommodityDisplayMode } from '@kawakawa/types'
import { api } from '../services/api'

// ==================== STATE ====================

// Reactive settings values
const settingsValues = ref<Record<string, unknown>>({})
const isLoaded = ref(false)
const isLoading = ref(false)

// Initialize with defaults
function initDefaults() {
  for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
    settingsValues.value[key] = def.defaultValue
  }
}

// Initialize on module load
initDefaults()

// ==================== STORE COMPOSABLE ====================

export const useSettingsStore = () => {
  // Load settings from localStorage cache (fast path)
  const loadFromCache = () => {
    try {
      const cached = localStorage.getItem('userSettings')
      if (cached) {
        const parsed = JSON.parse(cached)
        settingsValues.value = { ...settingsValues.value, ...parsed }
      }
    } catch {
      // Invalid cache, ignore
    }
  }

  // Load settings from API (and cache)
  const loadSettings = async () => {
    if (isLoading.value) return

    isLoading.value = true
    try {
      const response = await api.getUserSettings()
      settingsValues.value = response.values
      // Cache in localStorage
      localStorage.setItem('userSettings', JSON.stringify(response.values))
      isLoaded.value = true
    } catch (error) {
      console.error('Failed to load settings:', error)
      // Use cached values or defaults on error
    } finally {
      isLoading.value = false
    }
  }

  // Update one or more settings
  const updateSettings = async (
    updates: Partial<Record<SettingKey, unknown>>
  ): Promise<boolean> => {
    try {
      const response = await api.updateUserSettings(updates)
      settingsValues.value = response.values
      localStorage.setItem('userSettings', JSON.stringify(response.values))
      return true
    } catch (error) {
      console.error('Failed to update settings:', error)
      return false
    }
  }

  // Update a single setting
  const updateSetting = async <K extends SettingKey>(key: K, value: unknown): Promise<boolean> => {
    return updateSettings({ [key]: value } as Partial<Record<SettingKey, unknown>>)
  }

  // Reset a setting to default
  const resetSetting = async (key: SettingKey): Promise<boolean> => {
    try {
      const response = await api.resetUserSetting(key)
      settingsValues.value = response.values
      localStorage.setItem('userSettings', JSON.stringify(response.values))
      return true
    } catch (error) {
      console.error('Failed to reset setting:', error)
      return false
    }
  }

  // Reset all settings
  const resetAllSettings = async (): Promise<boolean> => {
    try {
      const response = await api.resetAllUserSettings()
      settingsValues.value = response.values
      localStorage.setItem('userSettings', JSON.stringify(response.values))
      return true
    } catch (error) {
      console.error('Failed to reset all settings:', error)
      return false
    }
  }

  // Generic getter for any setting
  const getSetting = <T>(key: SettingKey): T => {
    return settingsValues.value[key] as T
  }

  // Clear settings on logout
  const clearSettings = () => {
    localStorage.removeItem('userSettings')
    initDefaults()
    isLoaded.value = false
  }

  // ==================== TYPED COMPUTED PROPERTIES ====================

  // General settings
  const timezone = computed({
    get: () => settingsValues.value['general.timezone'] as string,
    set: (value: string) => updateSetting('general.timezone', value),
  })

  const datetimeFormat = computed({
    get: () => settingsValues.value['general.datetimeFormat'] as string,
    set: (value: string) => updateSetting('general.datetimeFormat', value),
  })

  const numberFormat = computed({
    get: () => settingsValues.value['general.numberFormat'] as string,
    set: (value: string) => updateSetting('general.numberFormat', value),
  })

  // Display settings
  const locationDisplayMode = computed({
    get: () => settingsValues.value['display.locationDisplayMode'] as LocationDisplayMode,
    set: (value: LocationDisplayMode) => updateSetting('display.locationDisplayMode', value),
  })

  const commodityDisplayMode = computed({
    get: () => settingsValues.value['display.commodityDisplayMode'] as CommodityDisplayMode,
    set: (value: CommodityDisplayMode) => updateSetting('display.commodityDisplayMode', value),
  })

  // Market settings
  const preferredCurrency = computed({
    get: () => settingsValues.value['market.preferredCurrency'] as Currency,
    set: (value: Currency) => updateSetting('market.preferredCurrency', value),
  })

  const defaultPriceList = computed({
    get: () => settingsValues.value['market.defaultPriceList'] as string | null,
    set: (value: string | null) => updateSetting('market.defaultPriceList', value),
  })

  const automaticPricing = computed({
    get: () => settingsValues.value['market.automaticPricing'] as boolean,
    set: (value: boolean) => updateSetting('market.automaticPricing', value),
  })

  const favoritedLocations = computed({
    get: () => settingsValues.value['market.favoritedLocations'] as string[],
    set: (value: string[]) => updateSetting('market.favoritedLocations', value),
  })

  const favoritedCommodities = computed({
    get: () => settingsValues.value['market.favoritedCommodities'] as string[],
    set: (value: string[]) => updateSetting('market.favoritedCommodities', value),
  })

  // Notification settings
  const browserNotificationsEnabled = computed({
    get: () => settingsValues.value['notifications.browserEnabled'] as boolean,
    set: (value: boolean) => updateSetting('notifications.browserEnabled', value),
  })

  const reservationPlacedNotification = computed({
    get: () => settingsValues.value['notifications.reservationPlaced'] as boolean,
    set: (value: boolean) => updateSetting('notifications.reservationPlaced', value),
  })

  const reservationStatusChangeNotification = computed({
    get: () => settingsValues.value['notifications.reservationStatusChange'] as boolean,
    set: (value: boolean) => updateSetting('notifications.reservationStatusChange', value),
  })

  // FIO settings
  const fioUsername = computed({
    get: () => settingsValues.value['fio.username'] as string,
    set: (value: string) => updateSetting('fio.username', value),
  })

  // Note: fio.apiKey is sensitive and not returned by the API
  // We track if credentials are configured by checking if fioUsername is set
  const hasFioCredentials = computed(() => {
    const username = settingsValues.value['fio.username'] as string
    return username && username.length > 0
  })

  const fioAutoSync = computed({
    get: () => settingsValues.value['fio.autoSync'] as boolean,
    set: (value: boolean) => updateSetting('fio.autoSync', value),
  })

  const fioExcludedLocations = computed({
    get: () => settingsValues.value['fio.excludedLocations'] as string[],
    set: (value: string[]) => updateSetting('fio.excludedLocations', value),
  })

  // ==================== HELPER GETTERS ====================

  // Get all settings for a category
  const getSettingsByCategory = (category: string) => {
    return Object.entries(SETTING_DEFINITIONS)
      .filter(([, def]) => def.category === category)
      .map(([key, def]) => ({
        key,
        definition: def,
        value: settingsValues.value[key],
      }))
  }

  // ==================== EXPORTS ====================

  return {
    // State
    settingsValues,
    isLoaded,
    isLoading,

    // Methods
    loadFromCache,
    loadSettings,
    updateSettings,
    updateSetting,
    resetSetting,
    resetAllSettings,
    getSetting,
    clearSettings,
    getSettingsByCategory,

    // Typed computed properties - General
    timezone,
    datetimeFormat,
    numberFormat,

    // Typed computed properties - Display
    locationDisplayMode,
    commodityDisplayMode,

    // Typed computed properties - Market
    preferredCurrency,
    defaultPriceList,
    automaticPricing,
    favoritedLocations,
    favoritedCommodities,

    // Typed computed properties - Notifications
    browserNotificationsEnabled,
    reservationPlacedNotification,
    reservationStatusChangeNotification,

    // Typed computed properties - FIO
    fioUsername,
    hasFioCredentials,
    fioAutoSync,
    fioExcludedLocations,

    // Exported definitions for UI
    SETTING_DEFINITIONS,
    SETTING_CATEGORIES,
    SETTING_CATEGORY_INFO,
  }
}
