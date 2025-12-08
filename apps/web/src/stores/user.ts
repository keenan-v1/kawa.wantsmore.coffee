// User store for managing user state across the application
// Note: Display preferences (currency, display modes) are now in the settings store
import { ref } from 'vue'
import type { User } from '../types'
import { useSettingsStore } from './settings'

const currentUser = ref<User | null>(null)

export const useUserStore = () => {
  const settingsStore = useSettingsStore()

  const setUser = (user: User) => {
    currentUser.value = user
    // Store in localStorage for persistence
    localStorage.setItem('user', JSON.stringify(user))
    // Load settings for this user
    settingsStore.loadFromCache()
    settingsStore.loadSettings()
  }

  const getUser = (): User | null => {
    if (currentUser.value) {
      return currentUser.value
    }
    // Try to load from localStorage
    const stored = localStorage.getItem('user')
    if (stored) {
      currentUser.value = JSON.parse(stored)
      return currentUser.value
    }
    return null
  }

  const clearUser = () => {
    currentUser.value = null
    localStorage.removeItem('user')
    // Clear settings cache
    settingsStore.clearSettings()
  }

  // Check if user has a specific permission
  const hasPermission = (permissionId: string): boolean => {
    const user = getUser()
    if (!user?.permissions) return false
    return user.permissions.includes(permissionId)
  }

  // Check if user has any of the specified permissions
  const hasAnyPermission = (permissionIds: string[]): boolean => {
    const user = getUser()
    if (!user?.permissions) return false
    return permissionIds.some(id => user.permissions.includes(id))
  }

  // ==================== DEPRECATED - Use settings store instead ====================
  // These methods are kept for backwards compatibility but delegate to settings store

  const getPreferredCurrency = () => {
    return settingsStore.preferredCurrency.value
  }

  const updateCurrency = async (currency: string) => {
    await settingsStore.updateSetting('display.preferredCurrency', currency)
  }

  const getLocationDisplayMode = () => {
    return settingsStore.locationDisplayMode.value
  }

  const updateLocationDisplayMode = async (mode: string) => {
    await settingsStore.updateSetting('display.locationDisplayMode', mode)
  }

  const getCommodityDisplayMode = () => {
    return settingsStore.commodityDisplayMode.value
  }

  const updateCommodityDisplayMode = async (mode: string) => {
    await settingsStore.updateSetting('display.commodityDisplayMode', mode)
  }

  const getBrowserNotificationsEnabled = () => {
    return settingsStore.browserNotificationsEnabled.value
  }

  const setBrowserNotificationsEnabled = async (enabled: boolean) => {
    await settingsStore.updateSetting('notifications.browserEnabled', enabled)
  }

  return {
    currentUser,
    setUser,
    getUser,
    clearUser,
    hasPermission,
    hasAnyPermission,
    // Deprecated - use settings store directly
    getPreferredCurrency,
    updateCurrency,
    getLocationDisplayMode,
    updateLocationDisplayMode,
    getCommodityDisplayMode,
    updateCommodityDisplayMode,
    getBrowserNotificationsEnabled,
    setBrowserNotificationsEnabled,
  }
}
