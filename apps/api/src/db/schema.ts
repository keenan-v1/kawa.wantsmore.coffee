// Database schema using Drizzle ORM
// Based on KawaKawa Market types and mock data

import { pgTable, serial, text, integer, decimal, timestamp, varchar, pgEnum, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Enums
export const currencyEnum = pgEnum('currency', ['ICA', 'CIS', 'AIC', 'NCC'])
export const locationTypeEnum = pgEnum('location_type', ['Station', 'Planet'])
export const locationDisplayModeEnum = pgEnum('location_display_mode', ['names-only', 'natural-ids-only', 'both'])
export const commodityDisplayModeEnum = pgEnum('commodity_display_mode', ['ticker-only', 'name-only', 'both'])
export const sellOrderLimitModeEnum = pgEnum('sell_order_limit_mode', ['none', 'max_sell', 'reserve'])

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
  id: varchar('id', { length: 100 }).primaryKey(), // 'orders.view_internal', 'orders.post_external', etc.
  name: varchar('name', { length: 100 }).notNull(), // Display name
  description: text('description'), // Explanation of what this permission does
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== ROLE PERMISSIONS (Many-to-Many) ====================
export const rolePermissions = pgTable('role_permissions', {
  id: serial('id').primaryKey(),
  roleId: varchar('role_id', { length: 50 }).notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: varchar('permission_id', { length: 100 }).notNull().references(() => permissions.id, { onDelete: 'cascade' }),
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
  userId: integer('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  fioUsername: varchar('fio_username', { length: 100 }), // FIO game username
  fioApiKey: text('fio_api_key'), // FIO API key (encrypted)
  preferredCurrency: currencyEnum('preferred_currency').notNull().default('CIS'),
  locationDisplayMode: locationDisplayModeEnum('location_display_mode').notNull().default('both'),
  commodityDisplayMode: commodityDisplayModeEnum('commodity_display_mode').notNull().default('both'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== PASSWORD RESET TOKENS ====================
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 255 }).notNull().unique(), // Unique token
  expiresAt: timestamp('expires_at').notNull(), // Expiration timestamp
  used: boolean('used').notNull().default(false), // Whether token has been used
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== USER ROLES (Many-to-Many) ====================
export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: varchar('role_id', { length: 50 }).notNull().references(() => roles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ==================== COMMODITIES ====================
export const commodities = pgTable('commodities', {
  ticker: varchar('ticker', { length: 10 }).primaryKey(), // 'H2O', 'RAT', 'FE', etc.
  name: varchar('name', { length: 100 }).notNull(), // 'Water', 'Rations', 'Iron', etc.
  category: varchar('category', { length: 50 }), // 'Agricultural', 'Mineral', 'Metal', etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== LOCATIONS ====================
export const locations = pgTable('locations', {
  id: varchar('id', { length: 20 }).primaryKey(), // 'BEN', 'UV-351a', 'KW-689c', etc.
  name: varchar('name', { length: 100 }).notNull(), // 'Benton Station', 'Katoa', etc.
  type: locationTypeEnum('type').notNull(), // 'Station' or 'Planet'
  systemCode: varchar('system_code', { length: 20 }).notNull(), // 'UV-351', 'KW-689', 'TD-203', etc.
  systemName: varchar('system_name', { length: 100 }).notNull(), // 'Benton', 'Shadow Garden', 'Hubur', etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== FIO INVENTORY (Raw synced data from FIO) ====================
export const fioInventory = pgTable('fio_inventory', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull().references(() => commodities.ticker),
  quantity: integer('quantity').notNull(),
  locationId: varchar('location_id', { length: 20 }).notNull().references(() => locations.id),
  lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== SELL ORDERS ====================
export const sellOrders = pgTable('sell_orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull().references(() => commodities.ticker),
  locationId: varchar('location_id', { length: 20 }).notNull().references(() => locations.id),
  price: decimal('price', { precision: 12, scale: 2 }).notNull(),
  currency: currencyEnum('currency').notNull(),
  limitMode: sellOrderLimitModeEnum('limit_mode').notNull().default('none'),
  limitQuantity: integer('limit_quantity'), // Only used when limitMode is 'max_sell' or 'reserve'
  targetRoleId: varchar('target_role_id', { length: 50 }).references(() => roles.id), // null = internal, set = visible to that role
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== RELATIONS ====================

export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(userSettings, {
    fields: [users.id],
    references: [userSettings.userId],
  }),
  userRoles: many(userRoles),
  passwordResetTokens: many(passwordResetTokens),
  fioInventory: many(fioInventory),
  sellOrders: many(sellOrders),
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

export const commoditiesRelations = relations(commodities, ({ many }) => ({
  fioInventory: many(fioInventory),
  sellOrders: many(sellOrders),
}))

export const locationsRelations = relations(locations, ({ many }) => ({
  fioInventory: many(fioInventory),
  sellOrders: many(sellOrders),
}))

export const fioInventoryRelations = relations(fioInventory, ({ one }) => ({
  user: one(users, {
    fields: [fioInventory.userId],
    references: [users.id],
  }),
  commodity: one(commodities, {
    fields: [fioInventory.commodityTicker],
    references: [commodities.ticker],
  }),
  location: one(locations, {
    fields: [fioInventory.locationId],
    references: [locations.id],
  }),
}))

export const sellOrdersRelations = relations(sellOrders, ({ one }) => ({
  user: one(users, {
    fields: [sellOrders.userId],
    references: [users.id],
  }),
  commodity: one(commodities, {
    fields: [sellOrders.commodityTicker],
    references: [commodities.ticker],
  }),
  location: one(locations, {
    fields: [sellOrders.locationId],
    references: [locations.id],
  }),
  targetRole: one(roles, {
    fields: [sellOrders.targetRoleId],
    references: [roles.id],
  }),
}))

