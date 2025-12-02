// Shared types for KawaKawa Market

export type Currency = 'ICA' | 'CIS' | 'AIC' | 'NCC'

export const CURRENCIES: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

export interface Commodity {
  ticker: string
  name: string
  category?: string
}

export interface Location {
  id: string // Destination code (e.g., BEN, KW-020c)
  name: string // Destination name (e.g., Benton Station, Katoa, KW-689c)
  type: 'Station' | 'Planet' | 'Platform' | 'Ship'
  systemCode: string // System code (e.g., UV-351, KW-689)
  systemName: string // System name (e.g., Benton, Shadow Garden)
}

export type LocationDisplayMode = 'names-only' | 'natural-ids-only' | 'both'

export type CommodityDisplayMode = 'ticker-only' | 'name-only' | 'both'

export interface Role {
  id: string
  name: string
  color: string // Vuetify color for UI chips (e.g., 'blue', 'green', 'red')
}

export interface User {
  profileName: string
  displayName: string
  fioUsername: string
  hasFioApiKey: boolean // Indicates if FIO API key is configured (never expose actual key)
  preferredCurrency: Currency
  locationDisplayMode?: LocationDisplayMode // Optional, defaults to 'both'
  commodityDisplayMode?: CommodityDisplayMode // Optional, defaults to 'both'
  roles: Role[] // One user to many roles
}

// FIO inventory synced from game
export interface FioInventoryItem {
  id: number
  commodityTicker: string
  quantity: number
  locationId: string
  lastSyncedAt: string // ISO date string
}

// Sell order limit modes
export type SellOrderLimitMode = 'none' | 'max_sell' | 'reserve'

// User sell order (offer to sell)
export interface SellOrder {
  id: number
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  limitMode: SellOrderLimitMode
  limitQuantity: number | null
  targetRoleId: string | null // null = internal order, set = visible to that role
}

// Sell order with calculated available quantity
export interface SellOrderWithAvailability extends SellOrder {
  fioQuantity: number // Raw FIO inventory quantity
  availableQuantity: number // Calculated based on limitMode
}
