// Database schema using Drizzle ORM
// Based on KawaKawa Market types and mock data

import { pgTable, serial, text, integer, decimal, timestamp, varchar, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Enums
export const currencyEnum = pgEnum('currency', ['ICA', 'CIS', 'AIC', 'NCC'])
export const locationTypeEnum = pgEnum('location_type', ['Station', 'Planet', 'Platform', 'Ship'])
export const locationDisplayModeEnum = pgEnum('location_display_mode', ['names', 'codes', 'mixed'])

// ==================== ROLES ====================
export const roles = pgTable('roles', {
  id: varchar('id', { length: 50 }).primaryKey(), // 'applicant', 'member', 'lead', etc.
  name: varchar('name', { length: 100 }).notNull(), // 'Applicant', 'Member', 'Lead', etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== USERS ====================
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  profileName: varchar('profile_name', { length: 100 }).notNull().unique(), // Login username
  passwordHash: text('password_hash').notNull(), // Hashed password
  displayName: varchar('display_name', { length: 100 }).notNull(), // Display name
  fioUsername: varchar('fio_username', { length: 100 }).notNull().default(''), // FIO game username
  preferredCurrency: currencyEnum('preferred_currency').notNull().default('CIS'),
  locationDisplayMode: locationDisplayModeEnum('location_display_mode').default('names'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
  type: locationTypeEnum('type').notNull(),
  systemCode: varchar('system_code', { length: 20 }).notNull(), // 'UV-351', 'KW-689', etc.
  systemName: varchar('system_name', { length: 100 }).notNull(), // 'Benton', 'Shadow Garden', etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== INVENTORY ====================
export const inventory = pgTable('inventory', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull().references(() => commodities.ticker),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 12, scale: 2 }).notNull(),
  currency: currencyEnum('currency').notNull(),
  locationId: varchar('location_id', { length: 20 }).notNull().references(() => locations.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== DEMANDS ====================
export const demands = pgTable('demands', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull().references(() => commodities.ticker),
  quantity: integer('quantity').notNull(),
  maxPrice: decimal('max_price', { precision: 12, scale: 2 }).notNull(),
  currency: currencyEnum('currency').notNull(),
  deliveryLocationId: varchar('delivery_location_id', { length: 20 }).notNull().references(() => locations.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== MARKET LISTINGS ====================
export const marketListings = pgTable('market_listings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  commodityTicker: varchar('commodity_ticker', { length: 10 }).notNull().references(() => commodities.ticker),
  quantity: integer('quantity').notNull(),
  price: decimal('price', { precision: 12, scale: 2 }).notNull(),
  currency: currencyEnum('currency').notNull(),
  locationId: varchar('location_id', { length: 20 }).notNull().references(() => locations.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ==================== RELATIONS ====================

export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  inventory: many(inventory),
  demands: many(demands),
  marketListings: many(marketListings),
}))

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
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
  inventory: many(inventory),
  demands: many(demands),
  marketListings: many(marketListings),
}))

export const locationsRelations = relations(locations, ({ many }) => ({
  inventory: many(inventory),
  demands: many(demands),
  marketListings: many(marketListings),
}))

export const inventoryRelations = relations(inventory, ({ one }) => ({
  user: one(users, {
    fields: [inventory.userId],
    references: [users.id],
  }),
  commodity: one(commodities, {
    fields: [inventory.commodityTicker],
    references: [commodities.ticker],
  }),
  location: one(locations, {
    fields: [inventory.locationId],
    references: [locations.id],
  }),
}))

export const demandsRelations = relations(demands, ({ one }) => ({
  user: one(users, {
    fields: [demands.userId],
    references: [users.id],
  }),
  commodity: one(commodities, {
    fields: [demands.commodityTicker],
    references: [commodities.ticker],
  }),
  location: one(locations, {
    fields: [demands.deliveryLocationId],
    references: [locations.id],
  }),
}))

export const marketListingsRelations = relations(marketListings, ({ one }) => ({
  user: one(users, {
    fields: [marketListings.userId],
    references: [users.id],
  }),
  commodity: one(commodities, {
    fields: [marketListings.commodityTicker],
    references: [commodities.ticker],
  }),
  location: one(locations, {
    fields: [marketListings.locationId],
    references: [locations.id],
  }),
}))
