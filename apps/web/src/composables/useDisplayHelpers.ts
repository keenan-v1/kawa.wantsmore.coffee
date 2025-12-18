import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useSettingsStore } from '../stores/settings'

/**
 * Composable for display helper functions that respect user settings.
 * Provides location and commodity display formatting based on user preferences.
 */
export function useDisplayHelpers() {
  const settingsStore = useSettingsStore()

  /**
   * Get a location display string respecting user's display mode preference.
   */
  const getLocationDisplay = (locationId: string | null): string => {
    if (!locationId) return 'Unknown'
    return locationService.getLocationDisplay(locationId, settingsStore.locationDisplayMode.value)
  }

  /**
   * Get a commodity display string respecting user's display mode preference.
   */
  const getCommodityDisplay = (ticker: string): string => {
    return commodityService.getCommodityDisplay(ticker, settingsStore.commodityDisplayMode.value)
  }

  /**
   * Get a commodity's category.
   */
  const getCommodityCategory = (ticker: string): string | null => {
    return commodityService.getCommodityCategory(ticker)
  }

  /**
   * Get a commodity's name (for icon display).
   */
  const getCommodityName = (ticker: string): string => {
    const commodities = commodityService.getAllCommoditiesSync()
    const commodity = commodities.find(c => c.ticker === ticker)
    return commodity?.name ?? ticker
  }

  return {
    getLocationDisplay,
    getCommodityDisplay,
    getCommodityCategory,
    getCommodityName,
  }
}
