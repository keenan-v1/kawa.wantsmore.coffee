// Shared types for KawaKawa CX

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
  permissions: string[] // Permission IDs granted to this user based on their roles
}

// Known permission IDs (for type safety in frontend)
export const PERMISSIONS = {
  ORDERS_VIEW_INTERNAL: 'orders.view_internal',
  ORDERS_POST_INTERNAL: 'orders.post_internal',
  ORDERS_VIEW_PARTNER: 'orders.view_partner',
  ORDERS_POST_PARTNER: 'orders.post_partner',
  ADMIN_MANAGE_USERS: 'admin.manage_users',
  ADMIN_MANAGE_ROLES: 'admin.manage_roles',
} as const

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

// Order types - shared between sell and buy orders
export type OrderType = 'internal' | 'partner'

export const ORDER_TYPES: OrderType[] = ['internal', 'partner']

// User sell order (offer to sell)
export interface SellOrder {
  id: number
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  orderType: OrderType // internal = members only, partner = trade partners
  limitMode: SellOrderLimitMode
  limitQuantity: number | null
}

// Sell order with calculated available quantity
export interface SellOrderWithAvailability extends SellOrder {
  fioQuantity: number // Raw FIO inventory quantity
  availableQuantity: number // Calculated based on limitMode
}

// User buy order (request to buy)
export interface BuyOrder {
  id: number
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  orderType: OrderType // internal = members only, partner = trade partners
}

// Market listing (sell order visible in market)
export interface MarketListing {
  id: number
  sellerName: string
  commodityTicker: string
  locationId: string
  price: number
  currency: Currency
  orderType: OrderType
  availableQuantity: number
  isOwn: boolean // true if this is the current user's listing
}
