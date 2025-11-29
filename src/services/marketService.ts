// Market service - handles inventory, demands, and market listings
// Mock implementation with localStorage persistence

import type { InventoryItem, Demand, MarketListing } from '../types'

// Use localStorage for persistence during development
const STORAGE_KEYS = {
  INVENTORY: 'kawa_inventory',
  DEMANDS: 'kawa_demands',
  MARKET_LISTINGS: 'kawa_market_listings'
}

// Helper to get data from localStorage
const getFromStorage = <T>(key: string, defaultValue: T[]): T[] => {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

// Helper to save data to localStorage
const saveToStorage = <T>(key: string, data: T[]): void => {
  localStorage.setItem(key, JSON.stringify(data))
}

// Mock initial data
const INITIAL_INVENTORY: InventoryItem[] = [
  {
    id: 1,
    commodity: 'H2O',
    quantity: 1000,
    price: 10.5,
    currency: 'CIS',
    location: 'PRM'  // Prometheus Station
  }
]

const INITIAL_DEMANDS: Demand[] = [
  {
    id: 1,
    commodity: 'FE',
    quantity: 500,
    maxPrice: 26.0,
    currency: 'CIS',
    deliveryLocation: 'BEN'  // Benten Station
  }
]

const INITIAL_MARKET_LISTINGS: MarketListing[] = [
  {
    id: 1,
    commodity: 'H2O',
    seller: 'WaterWorks',
    quantity: 1000,
    price: 10.5,
    currency: 'CIS',
    location: 'PRM'  // Prometheus Station
  },
  {
    id: 2,
    commodity: 'FE',
    seller: 'IronMines',
    quantity: 500,
    price: 25.0,
    currency: 'ICA',
    location: 'MOR'  // Moria Station
  },
  {
    id: 3,
    commodity: 'RAT',
    seller: 'AgriCorp',
    quantity: 250,
    price: 15.75,
    currency: 'AIC',
    location: 'HRT'  // Hortus Station
  }
]

// Flag to enable/disable mock mode
export const USE_MOCK_MARKET = true

export const marketService = {
  // ==================== INVENTORY ====================

  async getInventory(): Promise<InventoryItem[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (USE_MOCK_MARKET) {
          resolve(getFromStorage(STORAGE_KEYS.INVENTORY, INITIAL_INVENTORY))
        } else {
          // TODO: Replace with actual API call
          // const response = await fetch('/api/inventory')
          // resolve(await response.json())
          resolve([])
        }
      }, 300) // Simulate network delay
    })
  },

  async addInventoryItem(item: Omit<InventoryItem, 'id'>): Promise<InventoryItem> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (USE_MOCK_MARKET) {
          const inventory = getFromStorage(STORAGE_KEYS.INVENTORY, INITIAL_INVENTORY)
          const newId = Math.max(0, ...inventory.map(i => i.id)) + 1
          const newItem: InventoryItem = { ...item, id: newId }
          inventory.push(newItem)
          saveToStorage(STORAGE_KEYS.INVENTORY, inventory)
          resolve(newItem)
        } else {
          // TODO: Replace with actual API call
          // const response = await fetch('/api/inventory', { method: 'POST', body: JSON.stringify(item) })
          // resolve(await response.json())
          resolve({ ...item, id: 0 })
        }
      }, 300)
    })
  },

  async updateInventoryItem(item: InventoryItem): Promise<InventoryItem> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (USE_MOCK_MARKET) {
          const inventory = getFromStorage(STORAGE_KEYS.INVENTORY, INITIAL_INVENTORY)
          const index = inventory.findIndex(i => i.id === item.id)
          if (index > -1) {
            inventory[index] = item
            saveToStorage(STORAGE_KEYS.INVENTORY, inventory)
          }
          resolve(item)
        } else {
          // TODO: Replace with actual API call
          // const response = await fetch(`/api/inventory/${item.id}`, { method: 'PUT', body: JSON.stringify(item) })
          // resolve(await response.json())
          resolve(item)
        }
      }, 300)
    })
  },

  async deleteInventoryItem(id: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (USE_MOCK_MARKET) {
          const inventory = getFromStorage(STORAGE_KEYS.INVENTORY, INITIAL_INVENTORY)
          const filtered = inventory.filter(i => i.id !== id)
          saveToStorage(STORAGE_KEYS.INVENTORY, filtered)
          resolve()
        } else {
          // TODO: Replace with actual API call
          // await fetch(`/api/inventory/${id}`, { method: 'DELETE' })
          resolve()
        }
      }, 300)
    })
  },

  // ==================== DEMANDS ====================

  async getDemands(): Promise<Demand[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (USE_MOCK_MARKET) {
          resolve(getFromStorage(STORAGE_KEYS.DEMANDS, INITIAL_DEMANDS))
        } else {
          // TODO: Replace with actual API call
          // const response = await fetch('/api/demands')
          // resolve(await response.json())
          resolve([])
        }
      }, 300)
    })
  },

  async addDemand(demand: Omit<Demand, 'id'>): Promise<Demand> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (USE_MOCK_MARKET) {
          const demands = getFromStorage(STORAGE_KEYS.DEMANDS, INITIAL_DEMANDS)
          const newId = Math.max(0, ...demands.map(d => d.id)) + 1
          const newDemand: Demand = { ...demand, id: newId }
          demands.push(newDemand)
          saveToStorage(STORAGE_KEYS.DEMANDS, demands)
          resolve(newDemand)
        } else {
          // TODO: Replace with actual API call
          // const response = await fetch('/api/demands', { method: 'POST', body: JSON.stringify(demand) })
          // resolve(await response.json())
          resolve({ ...demand, id: 0 })
        }
      }, 300)
    })
  },

  async updateDemand(demand: Demand): Promise<Demand> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (USE_MOCK_MARKET) {
          const demands = getFromStorage(STORAGE_KEYS.DEMANDS, INITIAL_DEMANDS)
          const index = demands.findIndex(d => d.id === demand.id)
          if (index > -1) {
            demands[index] = demand
            saveToStorage(STORAGE_KEYS.DEMANDS, demands)
          }
          resolve(demand)
        } else {
          // TODO: Replace with actual API call
          // const response = await fetch(`/api/demands/${demand.id}`, { method: 'PUT', body: JSON.stringify(demand) })
          // resolve(await response.json())
          resolve(demand)
        }
      }, 300)
    })
  },

  async deleteDemand(id: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (USE_MOCK_MARKET) {
          const demands = getFromStorage(STORAGE_KEYS.DEMANDS, INITIAL_DEMANDS)
          const filtered = demands.filter(d => d.id !== id)
          saveToStorage(STORAGE_KEYS.DEMANDS, filtered)
          resolve()
        } else {
          // TODO: Replace with actual API call
          // await fetch(`/api/demands/${id}`, { method: 'DELETE' })
          resolve()
        }
      }, 300)
    })
  },

  // ==================== MARKET LISTINGS ====================

  async getMarketListings(): Promise<MarketListing[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (USE_MOCK_MARKET) {
          resolve(getFromStorage(STORAGE_KEYS.MARKET_LISTINGS, INITIAL_MARKET_LISTINGS))
        } else {
          // TODO: Replace with actual API call
          // const response = await fetch('/api/market/listings')
          // resolve(await response.json())
          resolve([])
        }
      }, 300)
    })
  }
}
