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

export type LocationDisplayMode = 'names' | 'codes' | 'mixed'

export interface Role {
  id: string
  name: string
}

export interface User {
  profileName: string
  displayName: string
  fioUsername: string
  preferredCurrency: Currency
  locationDisplayMode?: LocationDisplayMode // Optional, defaults to 'names'
  roles: Role[] // One user to many roles
}

export interface InventoryItem {
  id: number
  commodity: string // ticker
  quantity: number
  price: number
  currency: Currency
  location: string // location ID
}

export interface Demand {
  id: number
  commodity: string // ticker
  quantity: number
  maxPrice: number
  currency: Currency
  deliveryLocation: string // location ID
}

export interface MarketListing {
  id: number
  commodity: string // ticker
  seller: string
  quantity: number
  price: number
  currency: Currency
  location: string // location ID
}
