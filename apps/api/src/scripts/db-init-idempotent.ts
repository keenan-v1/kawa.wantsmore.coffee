#!/usr/bin/env tsx
// Idempotent database initialization script
// Safe to run multiple times - only seeds/syncs if database is empty
// Order: FIO sync first (locations needed for price_lists FK), then seed

import {
  db,
  client,
  fioCommodities,
  roles,
  permissions,
  rolePermissions,
  priceLists,
} from '../db/index.js'
import { sql } from 'drizzle-orm'
import { createLogger } from '../utils/logger.js'
import { syncCommodities } from '../services/fio/sync-commodities.js'
import { syncLocations } from '../services/fio/sync-locations.js'
import { syncStations } from '../services/fio/sync-stations.js'

const log = createLogger({ script: 'db-init-idempotent' })

async function checkIfDatabaseNeedsInit(): Promise<boolean> {
  try {
    // Check if fio_commodities table has data
    const result = await db.select({ ticker: fioCommodities.ticker }).from(fioCommodities).limit(1)
    return result.length === 0
  } catch {
    // If query fails, table might not exist yet - needs initialization
    log.info('Could not check fio_commodities table, assuming database needs initialization')
    return true
  }
}

async function runSeed() {
  // Uses imports from top of file

  log.info('Seeding roles and permissions')

  const ROLES_DATA = [
    { id: 'unverified', name: 'Unverified', color: 'grey' },
    { id: 'applicant', name: 'Applicant', color: 'teal' },
    { id: 'member', name: 'Member', color: 'blue' },
    { id: 'lead', name: 'Lead', color: 'green' },
    { id: 'trade-partner', name: 'Trade Partner', color: 'red' },
    { id: 'administrator', name: 'Administrator', color: 'purple' },
  ]

  const PERMISSIONS_DATA = [
    {
      id: 'orders.view_internal',
      name: 'View Internal Orders',
      description: 'Can view orders with no target role',
    },
    {
      id: 'orders.post_internal',
      name: 'Post Internal Orders',
      description: 'Can create orders with no target role',
    },
    {
      id: 'orders.view_partner',
      name: 'View Partner Orders',
      description: 'Can view orders for trade partners',
    },
    {
      id: 'orders.post_partner',
      name: 'Post Partner Orders',
      description: 'Can create orders for trade partners',
    },
    {
      id: 'reservations.place_internal',
      name: 'Place Internal Reservations',
      description: 'Can place reservations on internal orders',
    },
    {
      id: 'reservations.place_partner',
      name: 'Place Partner Reservations',
      description: 'Can place reservations on partner orders',
    },
    {
      id: 'admin.manage_users',
      name: 'Manage Users',
      description: 'Can view and modify user accounts',
    },
    {
      id: 'admin.manage_roles',
      name: 'Manage Roles',
      description: 'Can modify roles and their permissions',
    },
    {
      id: 'prices.view',
      name: 'View Price Lists',
      description: 'Can view price lists and effective prices',
    },
    {
      id: 'prices.manage',
      name: 'Manage Prices',
      description: 'Can create, update, and delete prices manually',
    },
    {
      id: 'prices.import',
      name: 'Import Prices',
      description: 'Can import prices from CSV or Google Sheets',
    },
    {
      id: 'prices.sync_fio',
      name: 'Sync FIO Prices',
      description: 'Can trigger FIO exchange price synchronization',
    },
    {
      id: 'adjustments.view',
      name: 'View Price Adjustments',
      description: 'Can view price adjustment rules',
    },
    {
      id: 'adjustments.manage',
      name: 'Manage Price Adjustments',
      description: 'Can create, update, and delete price adjustment rules',
    },
    {
      id: 'import_configs.manage',
      name: 'Manage Import Configurations',
      description: 'Can manage saved import configurations for Google Sheets',
    },
  ]

  type PriceListType = 'fio' | 'custom'
  type Currency = 'CIS' | 'NCC' | 'ICA' | 'AIC'
  const PRICE_LISTS_DATA: {
    code: string
    name: string
    description: string | null
    type: PriceListType
    defaultLocationId: string | null
    currency: Currency
  }[] = [
    {
      code: 'CI1',
      name: 'Commodity Exchange - Benton',
      description: 'FIO CI1 exchange at Benton station',
      type: 'fio',
      defaultLocationId: 'BEN',
      currency: 'CIS',
    },
    {
      code: 'NC1',
      name: 'Commodity Exchange - Moria',
      description: 'FIO NC1 exchange at Moria station',
      type: 'fio',
      defaultLocationId: 'MOR',
      currency: 'NCC',
    },
    {
      code: 'IC1',
      name: 'Commodity Exchange - Antares',
      description: 'FIO IC1 exchange at Antares station',
      type: 'fio',
      defaultLocationId: 'ANT',
      currency: 'ICA',
    },
    {
      code: 'AI1',
      name: 'Commodity Exchange - Hortus',
      description: 'FIO AI1 exchange at Hortus station',
      type: 'fio',
      defaultLocationId: 'HRT',
      currency: 'AIC',
    },
    {
      code: 'KAWA',
      name: 'KAWA Internal Exchange',
      description: 'Internal price list for KAWA members',
      type: 'custom',
      defaultLocationId: null,
      currency: 'CIS',
    },
  ]

  const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    unverified: [],
    applicant: ['orders.view_internal', 'orders.view_partner', 'prices.view', 'adjustments.view'],
    member: [
      'orders.view_internal',
      'orders.view_partner',
      'orders.post_internal',
      'reservations.place_internal',
      'prices.view',
      'adjustments.view',
    ],
    lead: [
      'orders.view_internal',
      'orders.view_partner',
      'orders.post_internal',
      'orders.post_partner',
      'reservations.place_internal',
      'reservations.place_partner',
      'prices.view',
      'prices.manage',
      'prices.import',
      'prices.sync_fio',
      'adjustments.view',
      'adjustments.manage',
      'import_configs.manage',
    ],
    'trade-partner': [
      'orders.view_partner',
      'orders.post_partner',
      'reservations.place_partner',
      'prices.view',
      'adjustments.view',
    ],
    administrator: [
      'orders.view_internal',
      'orders.view_partner',
      'admin.manage_users',
      'admin.manage_roles',
      'prices.view',
      'prices.manage',
      'prices.import',
      'prices.sync_fio',
      'adjustments.view',
      'adjustments.manage',
      'import_configs.manage',
    ],
  }

  // Upsert roles (insert or update name/color)
  await db
    .insert(roles)
    .values(ROLES_DATA)
    .onConflictDoUpdate({
      target: roles.id,
      set: {
        name: sql`EXCLUDED.name`,
        color: sql`EXCLUDED.color`,
      },
    })

  // Upsert permissions (insert or update name/description)
  await db
    .insert(permissions)
    .values(PERMISSIONS_DATA)
    .onConflictDoUpdate({
      target: permissions.id,
      set: {
        name: sql`EXCLUDED.name`,
        description: sql`EXCLUDED.description`,
      },
    })

  // Build role permissions data
  const rolePermissionsData: { roleId: string; permissionId: string; allowed: boolean }[] = []
  for (const [roleId, permissionIds] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    for (const permissionId of permissionIds) {
      rolePermissionsData.push({ roleId, permissionId, allowed: true })
    }
  }

  // Insert role permissions if they don't exist
  // Note: role_permissions doesn't have a unique constraint on (roleId, permissionId),
  // so we check for existence before inserting
  if (rolePermissionsData.length > 0) {
    // Get existing role-permission mappings
    const existingRolePerms = await db
      .select({
        roleId: rolePermissions.roleId,
        permissionId: rolePermissions.permissionId,
      })
      .from(rolePermissions)

    const existingSet = new Set(existingRolePerms.map(rp => `${rp.roleId}:${rp.permissionId}`))

    // Filter to only new mappings
    const newMappings = rolePermissionsData.filter(
      rp => !existingSet.has(`${rp.roleId}:${rp.permissionId}`)
    )

    if (newMappings.length > 0) {
      await db.insert(rolePermissions).values(newMappings)
      log.info({ count: newMappings.length }, 'Added new role-permission mappings')
    }
  }

  // Upsert price lists
  await db
    .insert(priceLists)
    .values(PRICE_LISTS_DATA)
    .onConflictDoUpdate({
      target: priceLists.code,
      set: {
        name: sql`EXCLUDED.name`,
        description: sql`EXCLUDED.description`,
        type: sql`EXCLUDED.type`,
        currency: sql`EXCLUDED.currency`,
      },
    })

  log.info('Seeding complete')
}

async function main() {
  log.info('Checking if database needs initialization')

  try {
    const needsInit = await checkIfDatabaseNeedsInit()

    if (needsInit) {
      log.info('Database is empty - running FIO sync first')

      // FIO sync FIRST - seed needs locations for price_lists FK
      log.info('Syncing FIO commodities')
      await syncCommodities()

      log.info('Syncing FIO locations')
      await syncLocations()

      log.info('Syncing FIO stations')
      await syncStations()
    } else {
      log.info('Database already has data - skipping FIO sync')
    }

    // Always run seed - it uses upserts so it's safe to run on existing data
    // This ensures new roles, permissions, and role-permission mappings are added
    log.info('Running seed (upserts roles, permissions, price lists)')
    await runSeed()

    log.info('Database initialization complete')
  } finally {
    await client.end()
  }
}

main().catch(async error => {
  log.error({ err: error }, 'Database initialization failed')
  try {
    await client.end()
  } catch {
    // Ignore connection close errors
  }
  process.exit(1)
})
