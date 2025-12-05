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

// ==================== USER SETTINGS ====================
export const userSettings = pgTable('user_settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  fioUsername: varchar('fio_username', { length: 100 }), // FIO game username
  fioApiKey: text('fio_api_key'), // FIO API key (encrypted)
  preferredCurrency: currencyEnum('preferred_currency').notNull().default('CIS'),
  locationDisplayMode: locationDisplayModeEnum('location_display_mode').notNull().default('both'),
  commodityDisplayMode: commodityDisplayModeEnum('commodity_display_mode')
    .notNull()
    .default('both'),
  // FIO sync preferences
  fioAutoSync: boolean('fio_auto_sync').notNull().default(true), // Auto-sync inventory on schedule
  fioExcludedLocations: text('fio_excluded_locations').array(), // Location NaturalIds or Names to exclude
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

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
  name: varchar('name', { length: 100 }).notNull(), // 'Benton Station', 'Katoa', etc.
  type: locationTypeEnum('type').notNull(), // 'Station' or 'Planet'
  systemId: varchar('system_id', { length: 40 }), // FIO system UUID
  systemNaturalId: varchar('system_natural_id', { length: 20 }).notNull(), // 'UV-351', 'KW-689', etc.
  systemName: varchar('system_name', { length: 100 }).notNull(), // 'Benton', 'Shadow Garden', 'Hubur', etc.
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

// ==================== RELATIONS ====================

export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId],
  }),
  userRoles: many(userRoles),
  passwordResetTokens: many(passwordResetTokens),
  fioUserStorage: many(fioUserStorage),
  sellOrders: many(sellOrders),
  buyOrders: many(buyOrders),
  discordProfile: one(userDiscordProfiles, {
    fields: [users.id],
    references: [userDiscordProfiles.userId],
  }),
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
}))

export const fioLocationsRelations = relations(fioLocations, ({ many }) => ({
  fioUserStorage: many(fioUserStorage),
  sellOrders: many(sellOrders),
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

export const sellOrdersRelations = relations(sellOrders, ({ one }) => ({
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
}))

export const buyOrdersRelations = relations(buyOrders, ({ one }) => ({
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
