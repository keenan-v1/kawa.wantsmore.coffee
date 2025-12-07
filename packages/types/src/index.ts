// Shared types for Kawakawa CX

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
  // FIO sync preferences
  fioAutoSync: boolean // Auto-sync inventory on schedule (default: true)
  fioExcludedLocations: string[] // Location NaturalIds or Names to exclude from sync
  roles: Role[] // One user to many roles
  permissions: string[] // Permission IDs granted to this user based on their roles
}

// Known permission IDs (for type safety in frontend)
export const PERMISSIONS = {
  ORDERS_VIEW_INTERNAL: 'orders.view_internal',
  ORDERS_POST_INTERNAL: 'orders.post_internal',
  ORDERS_VIEW_PARTNER: 'orders.view_partner',
  ORDERS_POST_PARTNER: 'orders.post_partner',
  RESERVATIONS_PLACE_INTERNAL: 'reservations.place_internal',
  RESERVATIONS_PLACE_PARTNER: 'reservations.place_partner',
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
  jumpCount: number | null // Jump count from destination (null if no destination specified)
  activeReservationCount: number // count of pending/confirmed reservations
  reservedQuantity: number // sum of quantities in active reservations
  remainingQuantity: number // availableQuantity - reservedQuantity
}

export interface MarketBuyRequest {
  id: number
  buyerName: string
  commodityTicker: string
  locationId: string
  quantity: number
  price: number
  currency: Currency
  orderType: OrderType
  isOwn: boolean
  jumpCount: number | null // Jump count from destination (null if no destination specified)
  activeReservationCount: number // count of pending/confirmed reservations
  reservedQuantity: number // sum of quantities in active reservations
  remainingQuantity: number // quantity - reservedQuantity
}

// ==================== DISCORD INTEGRATION ====================

// Discord OAuth2 settings (admin configuration)
export interface DiscordSettings {
  clientId: string
  hasClientSecret: boolean // Never expose actual secret
  hasBotToken: boolean // Never expose actual token
  redirectUri: string | null // OAuth redirect URI
  guildId: string | null
  guildName: string | null
  guildIcon: string | null // Icon hash for CDN URL construction
  autoApprovalEnabled: boolean
}

// Request to update Discord settings
export interface UpdateDiscordSettingsRequest {
  clientId?: string
  clientSecret?: string // Only sent when updating, never returned
  botToken?: string // Only sent when updating, never returned
  redirectUri?: string // OAuth redirect URI
  guildId?: string
  autoApprovalEnabled?: boolean
}

// Discord role mapping for auto-approval
export interface DiscordRoleMapping {
  id: number
  discordRoleId: string
  discordRoleName: string
  appRoleId: string
  appRoleName: string
  priority: number // Higher priority = checked first
}

// Request to create/update a role mapping
export interface DiscordRoleMappingRequest {
  discordRoleId: string
  discordRoleName: string
  appRoleId: string
  priority?: number
}

// Discord role from Discord API
export interface DiscordRole {
  id: string
  name: string
  color: number // Integer color value
  position: number // Role hierarchy position
  managed: boolean // Is this role managed by an integration?
}

// User's Discord profile (stored connection)
export interface UserDiscordProfile {
  discordId: string
  discordUsername: string
  discordAvatar: string | null // Avatar hash for CDN URL construction
  connectedAt: string // ISO date string
}

// Discord connection status for current user
export interface DiscordConnectionStatus {
  connected: boolean
  profile: UserDiscordProfile | null
  isMemberOfGuild: boolean | null // null if no guild configured
  guildRoles: string[] | null // Discord role IDs user has in the guild
}

// Discord OAuth callback request
export interface DiscordCallbackRequest {
  code: string
  state: string
}

// Discord test connection response
export interface DiscordTestConnectionResponse {
  success: boolean
  guild?: {
    id: string
    name: string
    icon: string | null
    memberCount?: number
  }
  error?: string
}

// Settings history entry (for audit trail)
export interface SettingHistoryEntry {
  id: number
  key: string
  value: string
  changedByUsername: string | null // null = system default
  effectiveAt: string // ISO date string
  createdAt: string // ISO date string
}

// ==================== DISCORD AUTHENTICATION ====================

// Discord OAuth auth URL response (for unauthenticated login/register flow)
export interface DiscordAuthUrlResponse {
  url: string
  state: string
}

// Discord auth callback result - indicates what happened
export type DiscordAuthResult =
  | { type: 'login'; token: string; user: DiscordAuthUser }
  | { type: 'register_required'; discordProfile: DiscordProfileForRegistration; state: string }
  | { type: 'account_exists_no_discord'; username: string }
  | { type: 'consent_required'; message: string }
  | { type: 'error'; message: string }

// User data returned after successful Discord login
export interface DiscordAuthUser {
  id: number
  username: string
  displayName: string
  email?: string
  roles: Role[]
  permissions: string[]
}

// Discord profile info for registration (before account is created)
export interface DiscordProfileForRegistration {
  discordId: string
  discordUsername: string
  discordAvatar: string | null
}

// Request to complete Discord registration
export interface DiscordRegisterRequest {
  state: string // State token from auth URL
  username?: string // Optional custom username (defaults to Discord username)
  displayName: string
  email?: string
}

// Response after Discord registration
export interface DiscordRegisterResponse {
  token: string
  user: DiscordAuthUser
  needsProfileCompletion: boolean
}

// ==================== NOTIFICATIONS ====================

export type NotificationType =
  | 'reservation_placed'
  | 'reservation_confirmed'
  | 'reservation_rejected'
  | 'reservation_fulfilled'
  | 'reservation_cancelled'
  | 'reservation_expired'
  | 'user_needs_approval'
  | 'user_auto_approved'
  | 'user_approved'
  | 'user_rejected'

export const NOTIFICATION_TYPES: NotificationType[] = [
  'reservation_placed',
  'reservation_confirmed',
  'reservation_rejected',
  'reservation_fulfilled',
  'reservation_cancelled',
  'reservation_expired',
  'user_needs_approval',
  'user_auto_approved',
  'user_approved',
  'user_rejected',
]

export interface Notification {
  id: number
  type: NotificationType
  title: string
  message: string | null
  data: Record<string, unknown> | null // { orderId, reservationId, counterpartyId, roles, etc. }
  isRead: boolean
  createdAt: string // ISO date string
}

export interface NotificationUnreadCount {
  count: number
}

// ==================== ORDER RESERVATIONS ====================

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'fulfilled'
  | 'expired'
  | 'cancelled'

export const RESERVATION_STATUSES: ReservationStatus[] = [
  'pending',
  'confirmed',
  'rejected',
  'fulfilled',
  'expired',
  'cancelled',
]

export interface OrderReservation {
  id: number
  // One of these will be set - indicates which order is being reserved from / filled
  sellOrderId: number | null // Set when reserving from a sell order
  buyOrderId: number | null // Set when filling a buy order
  counterpartyUserId: number // The user making the reservation
  quantity: number
  status: ReservationStatus
  notes: string | null
  expiresAt: string | null // ISO date string
  createdAt: string // ISO date string
  updatedAt: string // ISO date string
}

// Reservation with related order and user info
export interface ReservationWithDetails extends OrderReservation {
  // The order owner (seller if sellOrderId set, buyer if buyOrderId set)
  orderOwnerName: string
  orderOwnerUserId: number
  // The counterparty (buyer if sellOrderId set, seller if buyOrderId set)
  counterpartyName: string
  // Order details
  commodityTicker: string
  locationId: string
  price: number // Price from the order
  currency: Currency
  // Helpers for the current user
  isOrderOwner: boolean // true if current user owns the order being reserved/filled
  isCounterparty: boolean // true if current user is the one who created the reservation
}

// Request to create a reservation against a sell order (user wants to buy)
export interface CreateSellOrderReservationRequest {
  sellOrderId: number
  quantity: number
  notes?: string
  expiresAt?: string // ISO date string
}

// Request to create a reservation against a buy order (user wants to sell/fill)
export interface CreateBuyOrderReservationRequest {
  buyOrderId: number
  quantity: number
  notes?: string
  expiresAt?: string // ISO date string
}

// Union type for creating any reservation
export type CreateReservationRequest =
  | CreateSellOrderReservationRequest
  | CreateBuyOrderReservationRequest

// Request to update reservation status
export interface UpdateReservationStatusRequest {
  notes?: string
}
