// Commodity service - fetches from backend API

import type { Commodity, CommodityDisplayMode } from '../types'
import { camelCaseToHumanReadable } from '../utils/formatting'

// Cache for commodities to avoid repeated API calls
let cachedCommodities: Commodity[] | null = null

// Fetch commodities from backend API
const fetchCommodities = async (): Promise<Commodity[]> => {
  if (cachedCommodities) {
    return cachedCommodities
  }

  try {
    const response = await fetch('/api/commodities')
    if (!response.ok) {
      throw new Error(`Failed to fetch commodities: ${response.statusText}`)
    }
    const data = await response.json()
    cachedCommodities = data
    return data
  } catch (error) {
    console.error('Error fetching commodities:', error)
    return []
  }
}

export const commodityService = {
  // Get all commodities
  getAllCommodities: async (): Promise<Commodity[]> => {
    const commodities = await fetchCommodities()
    return [...commodities].sort((a, b) => a.ticker.localeCompare(b.ticker))
  },

  // Get commodity by ticker
  getCommodityByTicker: async (ticker: string): Promise<Commodity | undefined> => {
    const commodities = await fetchCommodities()
    return commodities.find(c => c.ticker === ticker)
  },

  // Get commodity display with flexible mode
  // ticker-only: "RAT"
  // name-only: "Basic Rations"
  // both: "RAT - Basic Rations"
  getCommodityDisplay: (ticker: string, mode: CommodityDisplayMode = 'both'): string => {
    // Synchronous fallback for display - shows ticker until data loads
    if (!cachedCommodities) {
      return ticker
    }
    const commodity = cachedCommodities.find(c => c.ticker === ticker)
    if (!commodity) return ticker

    if (mode === 'ticker-only') {
      return commodity.ticker
    } else if (mode === 'name-only') {
      return camelCaseToHumanReadable(commodity.name)
    } else {
      // both: ticker - name
      return `${commodity.ticker} - ${camelCaseToHumanReadable(commodity.name)}`
    }
  },

  // Get commodities for dropdown (returns array of { title, value })
  getCommodityOptions: async (mode: CommodityDisplayMode = 'both') => {
    const commodities = await fetchCommodities()
    return commodities
      .sort((a, b) => a.ticker.localeCompare(b.ticker))
      .map(c => ({
        title: commodityService.getCommodityDisplay(c.ticker, mode),
        value: c.ticker
      }))
  },

  // Get commodities by category
  getCommoditiesByCategory: async (category: string): Promise<Commodity[]> => {
    const commodities = await fetchCommodities()
    return commodities.filter(c => c.category === category)
  },

  // Get all categories
  getCategories: async (): Promise<string[]> => {
    const commodities = await fetchCommodities()
    const categories = new Set(commodities.map(c => c.category).filter(Boolean))
    return Array.from(categories).sort() as string[]
  },

  // Prefetch commodities (call this on app startup)
  prefetch: async (): Promise<void> => {
    await fetchCommodities()
  },

  // Clear cache (useful for refresh)
  clearCache: (): void => {
    cachedCommodities = null
  }
}
