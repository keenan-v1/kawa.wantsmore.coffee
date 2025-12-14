// Database schema using Drizzle ORM
// Based on Kawakawa CX types and mock data

import {
  pgTable,
  serial,
  text,
  integer,
  decimal,
  timestamp,
  varchar,
  pgEnum,
  boolean,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Enums
export const currencyEnum = pgEnum('currency', ['ICA', 'CIS', 'AIC', 'NCC'])
export const locationTypeEnum = pgEnum('location_type', ['Station', 'Planet'])
export const locationDisplayModeEnum = pgEnum('location_display_mode', [
  'names-only',
  'natural-ids-only',
  'both',
])
export const commodityDisplayModeEnum = pgEnum('commodity_display_mode', [
  'ticker-only',
  'name-only',
  'both',
])
export const sellOrderLimitModeEnum = pgEnum('sell_order_limit_mode', [
  'none',
  'max_sell',
  'reserve',
])
export const orderTypeEnum = pgEnum('order_type', ['internal', 'partner']) // Shared enum for sell/buy orders
export const notificationTypeEnum = pgEnum('notification_type', [
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
])
export const reservationStatusEnum = pgEnum('reservation_status', [
  'pending',
  'confirmed',
  'rejected',
  'fulfilled',
  'expired',
  'cancelled',
])

// ==================== PRICING SYSTEM ENUMS ====================
export const priceSourceEnum = pgEnum('price_source', [
  'manual',
  'csv_import',
  'google_sheets',
  'fio_exchange',
])

export const adjustmentTypeEnum = pgEnum('adjustment_type', ['percentage', 'fixed'])

export const priceListTypeEnum = pgEnum('price_list_type', ['fio', 'custom'])

export const importSourceTypeEnum = pgEnum('import_source_type', ['csv', 'google_sheets'])

export const importFormatEnum = pgEnum('import_format', ['flat', 'pivot', 'kawa'])

// ==================== SETTINGS (Generic key-value with history) ====================
export const settings = pgTable(
  'settings',
  {
    id: serial('id').primaryKey(),
    key: varchar('key', { length: 100 }).notNull(), // Setting key (e.g., 'discord.clientId')
    value: text('value').notNull(), // Setting value (JSON-encoded for complex values)
    changedByUserId: integer('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }), // null = system default
    effectiveAt: timestamp('effective_at').defaultNow().notNull(), // When this setting became effective
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    keyEffectiveIdx: uniqueIndex('settings_key_effective_idx').on(table.key, table.effectiveAt),
  })
)

// ==================== DISCORD ROLE MAPPINGS ====================
export const discordRoleMappings = pgTable(
  'discord_role_mappings',
  {
    id: serial('id').primaryKey(),
    discordRoleId: varchar('discord_role_id', { length: 100 }).notNull(), // Discord role snowflake ID
    discordRoleName: varchar('discord_role_name', { length: 100 }).notNull(), // Cached Discord role name
    appRoleId: varchar('app_role_id', { length: 50 })
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(0), // Higher priority = checked first for auto-approval
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueDiscordRole: uniqueIndex('discord_role_mappings_discord_role_idx').on(
      table.discordRoleId
    ),
  })
)

// ==================== DISCORD CHANNEL CONFIG (Key-value settings per channel) ====================
// Stores channel-specific settings using key-value pattern for flexibility
// Keys: priceList, visibility, currency, priceListEnforced, visibilityEnforced,
//       currencyEnforced, announceInternal, announcePartner
export const channelConfig = pgTable(
  'channel_config',
  {
    id: serial('id').primaryKey(),
    channelId: varchar('channel_id', { length: 30 }).notNull(), // Discord channel snowflake ID
    key: varchar('key', { length: 50 }).notNull(), // Setting key
    value: text('value').notNull(), // Setting value (stored as text)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueChannelKey: uniqueIndex('channel_config_channel_key_idx').on(table.channelId, table.key),
    channelIdx: index('channel_config_channel_idx').on(table.channelId),
  })
)

// ==================== USER DISCORD PROFILES ====================
export const userDiscordProfiles = pgTable(
  'user_discord_profiles',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    discordId: varchar('discord_id', { length: 100 }).notNull().unique(), // Discord user snowflake ID
    discordUsername: varchar('discord_username', { length: 100 }).notNull(), // Discord username (cached)
    discordAvatar: varchar('discord_avatar', { length: 255 }), // Avatar hash for display
    accessToken: text('access_token'), // OAuth access token (encrypted)
    refreshToken: text('refresh_token'), // OAuth refresh token (encrypted)
    tokenExpiresAt: timestamp('token_expires_at'), // When access token expires
    connectedAt: timestamp('connected_at').defaultNow().notNull(), // When user connected Discord
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueDiscordId: uniqueIndex('user_discord_profiles_discord_id_idx').on(table.discordId),
  })
)

// ==================== ROLES ====================
export const roles = pgTable('roles', {
  id: varchar('id', { length: 50 }).primaryKey(), // 'applicant', 'member', 'lead', etc.
  name: varchar('name', { length: 100 }).notNull(), // 'Applicant', 'Member', 'Lead', etc.
  color: varchar('color', { length: 20 }).notNull().default('grey'), // UI chip color (vuetify color names)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== PERMISSIONS ====================
export const permissions = pgTable('permissions', {
  id: varchar('id', { length: 100 }).primaryKey(), // 'orders.view_internal', 'orders.post_partner', etc.
  name: varchar('name', { length: 100 }).notNull(), // Display name
  description: text('description'), // Explanation of what this permission does
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== ROLE PERMISSIONS (Many-to-Many) ====================
export const rolePermissions = pgTable('role_permissions', {
  id: serial('id').primaryKey(),
  roleId: varchar('role_id', { length: 50 })
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: varchar('permission_id', { length: 100 })
    .notNull()
    .references(() => permissions.id, { onDelete: 'cascade' }),
  allowed: boolean('allowed').notNull().default(true), // true = granted, false = explicitly denied
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== USERS ====================
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 100 }).notNull().unique(), // Login username
  email: varchar('email', { length: 255 }), // Optional email for password resets
  displayName: varchar('display_name', { length: 100 }).notNull(), // Display name
  passwordHash: text('password_hash').notNull(), // Bcrypt hashed password with salt
  isActive: boolean('is_active').notNull().default(true), // Account active status
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== USER SETTINGS (Key-value settings per user) ====================
// Stores user preference overrides; defaults come from SETTING_DEFINITIONS in code
// All settings including FIO credentials (fio.username, fio.apiKey) are stored here
export const userSettings = pgTable(
  'user_settings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    settingKey: varchar('setting_key', { length: 100 }).notNull(), // e.g., 'display.preferredCurrency', 'fio.apiKey'
    value: text('value').notNull(), // JSON-encoded value
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueUserSetting: uniqueIndex('user_settings_user_key_idx').on(table.userId, table.settingKey),
  })
)

// ==================== PASSWORD RESET TOKENS ====================
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(), // Unique token
  expiresAt: timestamp('expires_at').notNull(), // Expiration timestamp
  used: boolean('used').notNull().default(false), // Whether token has been used
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== USER ROLES (Many-to-Many) ====================
export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: varchar('role_id', { length: 50 })
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== FIO COMMODITIES (Materials from FIO API) ====================
export const fioCommodities = pgTable('fio_commodities', {
  ticker: varchar('ticker', { length: 10 }).primaryKey(), // 'H2O', 'RAT', 'FE', etc.
  materialId: varchar('material_id', { length: 40 }), // FIO UUID for mapping
  name: varchar('name', { length: 100 }).notNull(), // 'water', 'rations', 'iron', etc.
  categoryName: varchar('category_name', { length: 50 }), // 'consumables (basic)', 'ores', 'metals', etc.
  categoryId: varchar('category_id', { length: 40 }), // FIO category UUID
  weight: decimal('weight', { precision: 10, scale: 6 }), // Weight per unit
  volume: decimal('volume', { precision: 10, scale: 6 }), // Volume per unit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== FIO LOCATIONS (Planets/Stations from FIO API) ====================
export const fioLocations = pgTable('fio_locations', {
  naturalId: varchar('natural_id', { length: 20 }).primaryKey(), // 'BEN', 'UV-351a', 'KW-689c', etc.
  name: varchar('name', { length: 100 }).notNull(), // 'Benten Station', 'Katoa', etc.
  type: locationTypeEnum('type').notNull(), // 'Station' or 'Planet'
  systemId: varchar('system_id', { length: 40 }), // FIO system UUID
  systemNaturalId: varchar('system_natural_id', { length: 20 }).notNull(), // 'UV-351', 'KW-689', etc.
  systemName: varchar('system_name', { length: 100 }).notNull(), // 'Benten', 'Shadow Garden', 'Hubur', etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== FIO USER STORAGE (Storage locations from FIO API) ====================
export const fioUserStorage = pgTable(
  'fio_user_storage',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storageId: varchar('storage_id', { length: 40 }).notNull(), // Generated as grouphub-{locationId}-{type}
    locationId: varchar('location_id', { length: 20 }).references(() => fioLocations.naturalId),
    type: varchar('type', { length: 30 }).notNull(), // 'STORE', 'WAREHOUSE_STORE', 'SHIP_STORE', etc.
    fioUploadedAt: timestamp('fio_uploaded_at'), // When FIO last got data from game (from LastUpdated)
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(), // When we last synced from FIO
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    uniqueUserStorage: uniqueIndex('fio_user_storage_user_storage_idx').on(
      table.userId,
      table.storageId
    ),
  })
)

// ==================== FIO INVENTORY (Items in storage from FIO API) ====================
export const fioInventory = pgTable('fio_inventory', {
  id: serial('id').primaryKey(),
  userStorageId: integer('user_storage_id')
    .notNull()
    .references(() => fioUserStorage.id, { onDelete: 'cascade' }),
  commodityTicker: varchar('commodity_ticker', { length: 10 })
    .notNull()
    .references(() => fioCommodities.ticker),
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== SELL ORDERS ====================
export const sellOrders = pgTable(
  'sell_orders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commodityTicker: varchar('commodity_ticker', { length: 10 })
      .notNull()
      .references(() => fioCommodities.ticker),
    locationId: varchar('location_id', { length: 20 })
      .notNull()
      .references(() => fioLocations.naturalId),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    priceListCode: varchar('price_list_code', { length: 20 }), // null = custom/fixed price, set = dynamic pricing from price list
    orderType: orderTypeEnum('order_type').notNull().default('internal'), // internal = members only, partner = trade partners
    limitMode: sellOrderLimitModeEnum('limit_mode').notNull().default('none'),
    limitQuantity: integer('limit_quantity'), // Only used when limitMode is 'max_sell' or 'reserve'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique constraint: one sell order per commodity/location/orderType/currency combination per user
    uniqueUserCommodityLocationTypeCurrency: uniqueIndex(
      'sell_orders_user_commodity_location_type_currency_idx'
    ).on(table.userId, table.commodityTicker, table.locationId, table.orderType, table.currency),
  })
)

// ==================== BUY ORDERS ====================
export const buyOrders = pgTable(
  'buy_orders',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    commodityTicker: varchar('commodity_ticker', { length: 10 })
      .notNull()
      .references(() => fioCommodities.ticker),
    locationId: varchar('location_id', { length: 20 })
      .notNull()
      .references(() => fioLocations.naturalId),
    quantity: integer('quantity').notNull(),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    currency: currencyEnum('currency').notNull(),
    priceListCode: varchar('price_list_code', { length: 20 }), // null = custom/fixed price, set = dynamic pricing from price list
    orderType: orderTypeEnum('order_type').notNull().default('internal'), // internal = members only, partner = trade partners
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique constraint: one buy order per commodity/location/orderType/currency combination per user
    uniqueUserCommodityLocationTypeCurrency: uniqueIndex(
      'buy_orders_user_commodity_location_type_currency_idx'
    ).on(table.userId, table.commodityTicker, table.locationId, table.orderType, table.currency),
  })
)

// ==================== NOTIFICATIONS ====================
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    message: text('message'),
    data: jsonb('data'), // { orderId, reservationId, counterpartyId, roles, etc. }
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userReadIdx: index('notifications_user_read_idx').on(
      table.userId,
      table.isRead,
      table.createdAt
    ),
  })
)

// ==================== ORDER RESERVATIONS (User reserving from/filling an order) ====================
// A reservation links a counterparty user to an order they want to reserve from or fill
// Either sellOrderId OR buyOrderId is set (not both) - indicating which order is being acted upon
export const orderReservations = pgTable(
  'order_reservations',
  {
    id: serial('id').primaryKey(),
    // One of these will be set - indicates which order is being reserved from / filled
    sellOrderId: integer('sell_order_id').references(() => sellOrders.id, { onDelete: 'cascade' }),
    buyOrderId: integer('buy_order_id').references(() => buyOrders.id, { onDelete: 'cascade' }),
    // The user making the reservation (buyer if reserving from sell, seller if filling buy)
    counterpartyUserId: integer('counterparty_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    status: reservationStatusEnum('status').notNull().default('pending'),
    notes: text('notes'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    sellOrderIdx: index('order_reservations_sell_order_idx').on(table.sellOrderId),
    buyOrderIdx: index('order_reservations_buy_order_idx').on(table.buyOrderId),
    counterpartyIdx: index('order_reservations_counterparty_idx').on(table.counterpartyUserId),
  })
)

// ==================== PRICE LISTS (Exchange definitions - CI1, KAWA, etc.) ====================
// Defines available price lists/exchanges and their properties
export const priceLists = pgTable('price_lists', {
  code: varchar('code', { length: 20 }).primaryKey(), // CI1, NC1, IC1, AI1, KAWA, etc.
  name: varchar('name', { length: 100 }).notNull(), // "Commodity Exchange - Benten", "KAWA Internal", etc.
  description: text('description'), // Optional description
  type: priceListTypeEnum('type').notNull(), // 'fio' = synced from FIO API, 'custom' = user-managed
  currency: currencyEnum('currency').notNull(), // Fixed currency for this price list
  defaultLocationId: varchar('default_location_id', { length: 20 }).references(
    () => fioLocations.naturalId
  ), // Default location for imports (Proxion for KAWA, BEN for CI1)
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== PRICES (Individual price records per commodity/location) ====================
export const prices = pgTable(
  'prices',
  {
    id: serial('id').primaryKey(),
    priceListCode: varchar('price_list_code', { length: 20 })
      .notNull()
      .references(() => priceLists.code), // FK to price list
    commodityTicker: varchar('commodity_ticker', { length: 10 })
      .notNull()
      .references(() => fioCommodities.ticker),
    locationId: varchar('location_id', { length: 20 })
      .notNull()
      .references(() => fioLocations.naturalId),
    price: decimal('price', { precision: 12, scale: 2 }).notNull(),
    // Currency is derived from price list, not stored per-price
    source: priceSourceEnum('source').notNull(), // How this price was set
    sourceReference: text('source_reference'), // Google Sheets URL, CSV filename, sync timestamp, etc.
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Unique constraint: one price per price list/commodity/location combination
    uniquePriceListCommodityLocation: uniqueIndex('prices_price_list_commodity_location_idx').on(
      table.priceListCode,
      table.commodityTicker,
      table.locationId
    ),
    // Index for efficient lookups by price list
    priceListIdx: index('prices_price_list_idx').on(table.priceListCode),
  })
)

// ==================== PRICE ADJUSTMENTS (Modifiers for prices) ====================
// Adjustments can target specific price lists, locations, commodities, or any combination
// NULL fields act as wildcards (match anything)
export const priceAdjustments = pgTable(
  'price_adjustments',
  {
    id: serial('id').primaryKey(),
    priceListCode: varchar('price_list_code', { length: 20 }).references(() => priceLists.code), // NULL = applies to all price lists
    commodityTicker: varchar('commodity_ticker', { length: 10 }).references(
      () => fioCommodities.ticker
    ), // NULL = applies to all commodities
    locationId: varchar('location_id', { length: 20 }).references(() => fioLocations.naturalId), // NULL = applies to all locations
    // Currency is now fixed per price list, so no currency field here
    adjustmentType: adjustmentTypeEnum('adjustment_type').notNull(), // 'percentage' or 'fixed'
    adjustmentValue: decimal('adjustment_value', { precision: 12, scale: 4 }).notNull(), // e.g., 5.00 for +5% or +5 units
    priority: integer('priority').notNull().default(0), // Order of application (lower = first)
    description: text('description'), // Human-readable explanation
    isActive: boolean('is_active').notNull().default(true), // Enable/disable without deleting
    effectiveFrom: timestamp('effective_from'), // NULL = immediately effective
    effectiveUntil: timestamp('effective_until'), // NULL = no expiration
    createdByUserId: integer('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Index for efficient lookups when calculating effective prices
    adjustmentLookupIdx: index('price_adjustments_lookup_idx').on(
      table.priceListCode,
      table.locationId,
      table.commodityTicker
    ),
    // Index for active adjustments
    activeIdx: index('price_adjustments_active_idx').on(table.isActive),
  })
)

// ==================== IMPORT CONFIGS (Saved import configurations for price lists) ====================
// Stores configurations for importing prices from external sources (Google Sheets, CSV)
export const importConfigs = pgTable(
  'import_configs',
  {
    id: serial('id').primaryKey(),
    priceListCode: varchar('price_list_code', { length: 20 })
      .notNull()
      .references(() => priceLists.code, { onDelete: 'cascade' }), // Target price list
    name: varchar('name', { length: 100 }).notNull(), // Configuration name, e.g., "KAWA Price Sheet"
    sourceType: importSourceTypeEnum('source_type').notNull(), // 'csv' or 'google_sheets'
    format: importFormatEnum('format').notNull(), // 'flat' or 'pivot'
    sheetsUrl: text('sheets_url'), // Google Sheets URL (for google_sheets source type)
    sheetGid: integer('sheet_gid'), // Specific sheet tab (null = first sheet)
    config: jsonb('config'), // Format-specific config (FlatConfig or PivotConfig as JSON)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Index for finding configs by price list
    priceListIdx: index('import_configs_price_list_idx').on(table.priceListCode),
  })
)

// ==================== RELATIONS ====================

export const usersRelations = relations(users, ({ many, one }) => ({
  settings: many(userSettings), // Key-value user settings (preferences & FIO credentials)
  userRoles: many(userRoles),
  passwordResetTokens: many(passwordResetTokens),
  fioUserStorage: many(fioUserStorage),
  sellOrders: many(sellOrders),
  buyOrders: many(buyOrders),
  notifications: many(notifications),
  reservations: many(orderReservations), // Reservations where user is the counterparty
  discordProfile: one(userDiscordProfiles, {
    fields: [users.id],
    references: [userDiscordProfiles.userId],
  }),
  createdPriceAdjustments: many(priceAdjustments), // Adjustments created by this user
}))

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, {
    fields: [userSettings.userId],
    references: [users.id],
  }),
}))

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
  discordRoleMappings: many(discordRoleMappings),
}))

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}))

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}))

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}))

export const fioCommoditiesRelations = relations(fioCommodities, ({ many }) => ({
  fioInventory: many(fioInventory),
  sellOrders: many(sellOrders),
  prices: many(prices),
  priceAdjustments: many(priceAdjustments),
}))

export const fioLocationsRelations = relations(fioLocations, ({ many }) => ({
  fioUserStorage: many(fioUserStorage),
  sellOrders: many(sellOrders),
  priceLists: many(priceLists), // Price lists with this as default location
  prices: many(prices),
  priceAdjustments: many(priceAdjustments),
}))

export const fioUserStorageRelations = relations(fioUserStorage, ({ one, many }) => ({
  user: one(users, {
    fields: [fioUserStorage.userId],
    references: [users.id],
  }),
  location: one(fioLocations, {
    fields: [fioUserStorage.locationId],
    references: [fioLocations.naturalId],
  }),
  fioInventory: many(fioInventory),
}))

export const fioInventoryRelations = relations(fioInventory, ({ one }) => ({
  userStorage: one(fioUserStorage, {
    fields: [fioInventory.userStorageId],
    references: [fioUserStorage.id],
  }),
  commodity: one(fioCommodities, {
    fields: [fioInventory.commodityTicker],
    references: [fioCommodities.ticker],
  }),
}))

export const sellOrdersRelations = relations(sellOrders, ({ one, many }) => ({
  user: one(users, {
    fields: [sellOrders.userId],
    references: [users.id],
  }),
  commodity: one(fioCommodities, {
    fields: [sellOrders.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  location: one(fioLocations, {
    fields: [sellOrders.locationId],
    references: [fioLocations.naturalId],
  }),
  reservations: many(orderReservations),
}))

export const buyOrdersRelations = relations(buyOrders, ({ one, many }) => ({
  user: one(users, {
    fields: [buyOrders.userId],
    references: [users.id],
  }),
  commodity: one(fioCommodities, {
    fields: [buyOrders.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  location: one(fioLocations, {
    fields: [buyOrders.locationId],
    references: [fioLocations.naturalId],
  }),
  reservations: many(orderReservations),
}))

// ==================== DISCORD & SETTINGS RELATIONS ====================

export const settingsRelations = relations(settings, ({ one }) => ({
  changedByUser: one(users, {
    fields: [settings.changedByUserId],
    references: [users.id],
  }),
}))

export const discordRoleMappingsRelations = relations(discordRoleMappings, ({ one }) => ({
  appRole: one(roles, {
    fields: [discordRoleMappings.appRoleId],
    references: [roles.id],
  }),
}))

export const userDiscordProfilesRelations = relations(userDiscordProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userDiscordProfiles.userId],
    references: [users.id],
  }),
}))

// ==================== NOTIFICATIONS & RESERVATIONS RELATIONS ====================

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}))

export const orderReservationsRelations = relations(orderReservations, ({ one }) => ({
  buyOrder: one(buyOrders, {
    fields: [orderReservations.buyOrderId],
    references: [buyOrders.id],
  }),
  sellOrder: one(sellOrders, {
    fields: [orderReservations.sellOrderId],
    references: [sellOrders.id],
  }),
  counterpartyUser: one(users, {
    fields: [orderReservations.counterpartyUserId],
    references: [users.id],
  }),
}))

// ==================== PRICING SYSTEM RELATIONS ====================

export const priceListsRelations = relations(priceLists, ({ one, many }) => ({
  defaultLocation: one(fioLocations, {
    fields: [priceLists.defaultLocationId],
    references: [fioLocations.naturalId],
  }),
  prices: many(prices),
  priceAdjustments: many(priceAdjustments),
  importConfigs: many(importConfigs),
}))

export const pricesRelations = relations(prices, ({ one }) => ({
  priceList: one(priceLists, {
    fields: [prices.priceListCode],
    references: [priceLists.code],
  }),
  commodity: one(fioCommodities, {
    fields: [prices.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  location: one(fioLocations, {
    fields: [prices.locationId],
    references: [fioLocations.naturalId],
  }),
}))

export const priceAdjustmentsRelations = relations(priceAdjustments, ({ one }) => ({
  priceList: one(priceLists, {
    fields: [priceAdjustments.priceListCode],
    references: [priceLists.code],
  }),
  commodity: one(fioCommodities, {
    fields: [priceAdjustments.commodityTicker],
    references: [fioCommodities.ticker],
  }),
  location: one(fioLocations, {
    fields: [priceAdjustments.locationId],
    references: [fioLocations.naturalId],
  }),
  createdByUser: one(users, {
    fields: [priceAdjustments.createdByUserId],
    references: [users.id],
  }),
}))

export const importConfigsRelations = relations(importConfigs, ({ one }) => ({
  priceList: one(priceLists, {
    fields: [importConfigs.priceListCode],
    references: [priceLists.code],
  }),
}))
