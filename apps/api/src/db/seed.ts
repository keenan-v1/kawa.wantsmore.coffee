// Seed database with initial roles and permissions
// Commodities and locations will come from FIO API integration
import { db, client, roles, permissions, rolePermissions } from './index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'seed' })

// Initial roles for the application with colors
const ROLES_DATA = [
  { id: 'unverified', name: 'Unverified', color: 'grey' }, // New registrations, awaiting approval
  { id: 'applicant', name: 'Applicant', color: 'teal' },
  { id: 'member', name: 'Member', color: 'blue' },
  { id: 'lead', name: 'Lead', color: 'green' },
  { id: 'trade-partner', name: 'Trade Partner', color: 'red' },
  { id: 'administrator', name: 'Administrator', color: 'purple' },
]

// Initial permissions
const PERMISSIONS_DATA = [
  {
    id: 'orders.view_internal',
    name: 'View Internal Orders',
    description: 'Can view orders with no target role (internal orders)',
  },
  {
    id: 'orders.post_internal',
    name: 'Post Internal Orders',
    description: 'Can create orders with no target role (internal orders)',
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
  // Pricing system permissions
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

// Default role permissions (roleId -> list of permissionIds that are allowed)
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  unverified: [
    // No permissions - users must be verified before they can do anything
  ],
  applicant: [
    'orders.view_internal',
    'orders.view_partner',
    'prices.view', // Can view price lists
    'adjustments.view', // Can view adjustments
    // Note: applicants cannot post by default
  ],
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
    'orders.view_partner', // Can only see partner orders
    'orders.post_partner', // Can post partner orders
    'reservations.place_partner', // Can place reservations on partner orders
    'prices.view', // Can view prices
    'adjustments.view', // Can view adjustments
  ],
  administrator: [
    'orders.view_internal',
    'orders.view_partner',
    // Note: administrators do NOT get order posting permissions by default
    // Combine with 'member' or 'trade-partner' roles if they need to create orders
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

async function seed() {
  log.info('Seeding database')

  try {
    // Seed roles
    log.info('Seeding roles')
    await db.insert(roles).values(ROLES_DATA).onConflictDoNothing()
    log.info({ count: ROLES_DATA.length }, 'Seeded roles')

    // Seed permissions
    log.info('Seeding permissions')
    await db.insert(permissions).values(PERMISSIONS_DATA).onConflictDoNothing()
    log.info({ count: PERMISSIONS_DATA.length }, 'Seeded permissions')

    // Seed role permissions
    log.info('Seeding role permissions')
    const rolePermissionsData: {
      roleId: string
      permissionId: string
      allowed: boolean
    }[] = []
    for (const [roleId, permissionIds] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const permissionId of permissionIds) {
        rolePermissionsData.push({ roleId, permissionId, allowed: true })
      }
    }
    if (rolePermissionsData.length > 0) {
      await db.insert(rolePermissions).values(rolePermissionsData).onConflictDoNothing()
    }
    log.info({ count: rolePermissionsData.length }, 'Seeded role permissions')

    log.info('Database seeding complete')
  } catch (error) {
    log.error({ err: error }, 'Error seeding database')
    throw error
  } finally {
    // Close the connection
    await client.end()
  }
}

seed()
