// Commodity service - fetches from backend API with localStorage persistence

import type { Commodity, CommodityDisplayMode } from '../types'
import { localizeMaterial } from '../utils/materials'

// Cache keys and TTL
const CACHE_KEY = 'kawakawa:commodities'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface CacheEntry {
  data: Commodity[]
  timestamp: number
}

// In-memory cache for fast access during session
let cachedCommodities: Commodity[] | null = null

// Load from localStorage on module init
const loadFromStorage = (): Commodity[] | null => {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (!stored) return null

    const entry: CacheEntry = JSON.parse(stored)
    const age = Date.now() - entry.timestamp

    if (age > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    return entry.data
  } catch {
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}

// Save to localStorage
const saveToStorage = (data: Commodity[]): void => {
  try {
    const entry: CacheEntry = { data, timestamp: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch (error) {
    console.warn('Failed to cache commodities to localStorage:', error)
  }
}

// Initialize from localStorage
cachedCommodities = loadFromStorage()

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
    saveToStorage(data)
    return data
  } catch (error) {
    console.error('Error fetching commodities:', error)
    return []
  }
}

export const commodityService = {
  // Get all commodities (async)
  getAllCommodities: async (): Promise<Commodity[]> => {
    const commodities = await fetchCommodities()
    return [...commodities].sort((a, b) => a.ticker.localeCompare(b.ticker))
  },

  // Get all commodities from cache (synchronous, returns empty array if not loaded)
  getAllCommoditiesSync: (): Commodity[] => {
    if (!cachedCommodities) return []
    return [...cachedCommodities].sort((a, b) => a.ticker.localeCompare(b.ticker))
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
      return localizeMaterial(commodity.name)
    } else {
      // both: ticker - name
      return `${commodity.ticker} - ${localizeMaterial(commodity.name)}`
    }
  },

  // Get commodity category by ticker (synchronous, uses cache)
  getCommodityCategory: (ticker: string): string | null => {
    if (!cachedCommodities) {
      return null
    }
    const commodity = cachedCommodities.find(c => c.ticker === ticker)
    return commodity?.category ?? null
  },

  // Get commodities for dropdown (returns array of { title, value })
  getCommodityOptions: async (mode: CommodityDisplayMode = 'both') => {
    const commodities = await fetchCommodities()
    return commodities
      .sort((a, b) => a.ticker.localeCompare(b.ticker))
      .map(c => ({
        title: commodityService.getCommodityDisplay(c.ticker, mode),
        value: c.ticker,
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
    localStorage.removeItem(CACHE_KEY)
  },
}
