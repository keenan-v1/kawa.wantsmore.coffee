// Seed database with initial roles and permissions
// Commodities and locations will come from FIO API integration
import { db, roles, permissions, rolePermissions } from './index.js'
import postgres from 'postgres'

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
    id: 'admin.manage_users',
    name: 'Manage Users',
    description: 'Can view and modify user accounts',
  },
  {
    id: 'admin.manage_roles',
    name: 'Manage Roles',
    description: 'Can modify roles and their permissions',
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
    // Note: applicants cannot post by default
  ],
  member: ['orders.view_internal', 'orders.view_partner', 'orders.post_internal'],
  lead: [
    'orders.view_internal',
    'orders.view_partner',
    'orders.post_internal',
    'orders.post_partner',
  ],
  'trade-partner': [
    'orders.view_partner', // Can only see partner orders
    'orders.post_partner', // Can post partner orders
  ],
  administrator: [
    'orders.view_internal',
    'orders.view_partner',
    'orders.post_internal',
    'orders.post_partner',
    'admin.manage_users',
    'admin.manage_roles',
  ],
}

async function seed() {
  console.log('🌱 Seeding database...')

  try {
    // Seed roles
    console.log('📝 Seeding roles...')
    await db.insert(roles).values(ROLES_DATA).onConflictDoNothing()
    console.log(`✅ Seeded ${ROLES_DATA.length} roles`)

    // Seed permissions
    console.log('📝 Seeding permissions...')
    await db.insert(permissions).values(PERMISSIONS_DATA).onConflictDoNothing()
    console.log(`✅ Seeded ${PERMISSIONS_DATA.length} permissions`)

    // Seed role permissions
    console.log('📝 Seeding role permissions...')
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
    console.log(`✅ Seeded ${rolePermissionsData.length} role permissions`)

    console.log('✨ Database seeding complete!')
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    throw error
  } finally {
    // Close the connection
    await postgres(process.env.DATABASE_URL!).end()
  }
}

seed()
