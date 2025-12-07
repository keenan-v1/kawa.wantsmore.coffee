// User store for managing user state across the application
import { ref } from 'vue'
import type { User, Currency, LocationDisplayMode, CommodityDisplayMode } from '../types'

const currentUser = ref<User | null>(null)

export const useUserStore = () => {
  const setUser = (user: User) => {
    currentUser.value = user
    // Store in localStorage for persistence
    localStorage.setItem('user', JSON.stringify(user))
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

  const updateCurrency = (currency: Currency) => {
    if (currentUser.value) {
      currentUser.value.preferredCurrency = currency
      localStorage.setItem('user', JSON.stringify(currentUser.value))
    }
  }

  const clearUser = () => {
    currentUser.value = null
    localStorage.removeItem('user')
  }

  const getPreferredCurrency = (): Currency => {
    const user = getUser()
    return user?.preferredCurrency || 'CIS'
  }

  const updateLocationDisplayMode = (mode: LocationDisplayMode) => {
    if (currentUser.value) {
      currentUser.value.locationDisplayMode = mode
      localStorage.setItem('user', JSON.stringify(currentUser.value))
    }
  }

  const getLocationDisplayMode = (): LocationDisplayMode => {
    const user = getUser()
    return user?.locationDisplayMode || 'both'
  }

  const updateCommodityDisplayMode = (mode: CommodityDisplayMode) => {
    if (currentUser.value) {
      currentUser.value.commodityDisplayMode = mode
      localStorage.setItem('user', JSON.stringify(currentUser.value))
    }
  }

  const getCommodityDisplayMode = (): CommodityDisplayMode => {
    const user = getUser()
    return user?.commodityDisplayMode || 'both'
  }

  // Browser notifications preference (stored in localStorage)
  const setBrowserNotificationsEnabled = (enabled: boolean) => {
    localStorage.setItem('browserNotificationsEnabled', JSON.stringify(enabled))
  }

  const getBrowserNotificationsEnabled = (): boolean => {
    const stored = localStorage.getItem('browserNotificationsEnabled')
    return stored ? JSON.parse(stored) : false
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

  return {
    currentUser,
    setUser,
    getUser,
    updateCurrency,
    clearUser,
    getPreferredCurrency,
    updateLocationDisplayMode,
    getLocationDisplayMode,
    updateCommodityDisplayMode,
    getCommodityDisplayMode,
    setBrowserNotificationsEnabled,
    getBrowserNotificationsEnabled,
    hasPermission,
    hasAnyPermission,
  }
}
