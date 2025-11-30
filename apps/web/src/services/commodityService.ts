// Commodity service - mock FIO data
// Will be replaced with actual FIO API integration

import type { Commodity } from '../types'

// Mock commodity data from Prosperous Universe
const MOCK_COMMODITIES: Commodity[] = [
  // Basic resources
  { ticker: 'H2O', name: 'Water', category: 'Agricultural' },
  { ticker: 'RAT', name: 'Rations', category: 'Agricultural' },
  { ticker: 'DW', name: 'Drinking Water', category: 'Agricultural' },
  { ticker: 'PWO', name: 'Purified Water', category: 'Agricultural' },

  // Minerals
  { ticker: 'FE', name: 'Iron', category: 'Mineral' },
  { ticker: 'O', name: 'Oxygen', category: 'Mineral' },
  { ticker: 'H', name: 'Hydrogen', category: 'Mineral' },
  { ticker: 'C', name: 'Carbon', category: 'Mineral' },
  { ticker: 'SI', name: 'Silicon', category: 'Mineral' },
  { ticker: 'AL', name: 'Aluminum', category: 'Mineral' },
  { ticker: 'CU', name: 'Copper', category: 'Mineral' },
  { ticker: 'S', name: 'Sulfur', category: 'Mineral' },
  { ticker: 'NA', name: 'Sodium', category: 'Mineral' },
  { ticker: 'CL', name: 'Chlorine', category: 'Mineral' },

  // Metals
  { ticker: 'FEO', name: 'Iron Ore', category: 'Metal' },
  { ticker: 'ALO', name: 'Aluminum Ore', category: 'Metal' },
  { ticker: 'CUO', name: 'Copper Ore', category: 'Metal' },
  { ticker: 'LST', name: 'Limestone', category: 'Metal' },
  { ticker: 'HAL', name: 'Halite', category: 'Metal' },

  // Construction materials
  { ticker: 'BSE', name: 'Basic Structure Elements', category: 'Construction' },
  { ticker: 'BDE', name: 'Basic Deck Elements', category: 'Construction' },
  { ticker: 'BTA', name: 'Basic Truss Elements', category: 'Construction' },
  { ticker: 'MCG', name: 'Metallurgical Coke', category: 'Construction' },
  { ticker: 'FLP', name: 'Fiberglass Panel', category: 'Construction' },

  // Electronics
  { ticker: 'PE', name: 'Plastic Elements', category: 'Electronics' },
  { ticker: 'SEA', name: 'Silicon Sealant', category: 'Electronics' },
  { ticker: 'BBH', name: 'Bulkhead', category: 'Electronics' },
  { ticker: 'TRU', name: 'Truss', category: 'Electronics' },
  { ticker: 'TCS', name: 'Thermal Control System', category: 'Electronics' },

  // Fuels
  { ticker: 'FF', name: 'Fusion Fuel', category: 'Fuel' },
  { ticker: 'SF', name: 'Ship Fuel', category: 'Fuel' },
  { ticker: 'AMM', name: 'Ammonia', category: 'Fuel' },

  // Luxury
  { ticker: 'EXO', name: 'Luxury Meal', category: 'Luxury' },
  { ticker: 'COF', name: 'Coffee', category: 'Luxury' },
  { ticker: 'WIN', name: 'Wine', category: 'Luxury' },
]

export const commodityService = {
  // Get all commodities
  getAllCommodities: (): Commodity[] => {
    return [...MOCK_COMMODITIES].sort((a, b) => a.ticker.localeCompare(b.ticker))
  },

  // Get commodity by ticker
  getCommodityByTicker: (ticker: string): Commodity | undefined => {
    return MOCK_COMMODITIES.find(c => c.ticker === ticker)
  },

  // Get commodity display name (ticker - name)
  getCommodityDisplay: (ticker: string): string => {
    const commodity = MOCK_COMMODITIES.find(c => c.ticker === ticker)
    return commodity ? `${commodity.ticker} - ${commodity.name}` : ticker
  },

  // Get commodities for dropdown (returns array of { title, value })
  getCommodityOptions: () => {
    return MOCK_COMMODITIES
      .sort((a, b) => a.ticker.localeCompare(b.ticker))
      .map(c => ({
        title: `${c.ticker} - ${c.name}`,
        value: c.ticker
      }))
  },

  // Get commodities by category
  getCommoditiesByCategory: (category: string): Commodity[] => {
    return MOCK_COMMODITIES.filter(c => c.category === category)
  },

  // Get all categories
  getCategories: (): string[] => {
    const categories = new Set(MOCK_COMMODITIES.map(c => c.category).filter(Boolean))
    return Array.from(categories).sort() as string[]
  }
}
