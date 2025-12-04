#!/usr/bin/env tsx
// Add a role to a user via CLI
// Usage: tsx src/scripts/admin-add-role.ts <username> <roleId>

import { db, users, userRoles, roles } from '../db/index.js'
import { eq, and } from 'drizzle-orm'

async function addRole(username: string, roleId: string) {
  console.log(`👤 Adding role '${roleId}' to user '${username}'...\n`)

  // Find the user
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user) {
    console.error(`❌ Error: User '${username}' not found`)
    process.exit(1)
  }

  // Check if the role exists
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1)

  if (!role) {
    console.error(`❌ Error: Role '${roleId}' not found`)
    console.log('\nAvailable roles:')
    const allRoles = await db.select().from(roles)
    for (const r of allRoles) {
      console.log(`  - ${r.id} (${r.name})`)
    }
    process.exit(1)
  }

  // Check if user already has this role
  const [existingRole] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, roleId)))
    .limit(1)

  if (existingRole) {
    console.log(`ℹ️  User '${username}' already has role '${roleId}' (${role.name})`)
    process.exit(0)
  }

  // Add the role
  await db.insert(userRoles).values({
    userId: user.id,
    roleId: roleId,
  })

  console.log(`✅ Added role '${roleId}' (${role.name}) to user '${username}'`)

  // Show current roles
  const currentRoles = await db
    .select({ roleId: roles.id, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id))

  console.log(`\n📋 Current roles for '${username}':`)
  for (const r of currentRoles) {
    console.log(`  - ${r.roleId} (${r.roleName})`)
  }

  process.exit(0)
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length < 2 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: pnpm admin:add-role <username> <roleId>')
  console.log('')
  console.log('Add a role to a user.')
  console.log('')
  console.log('Available roles:')
  console.log('  - unverified    New registrations awaiting approval')
  console.log('  - applicant     Approved but not yet a full member')
  console.log('  - member        Full member with internal order access')
  console.log('  - lead          Lead with both internal and partner access')
  console.log('  - trade-partner External trade partner')
  console.log('  - administrator System administrator')
  console.log('')
  console.log('Examples:')
  console.log('  pnpm admin:add-role johndoe member')
  console.log('  pnpm admin:add-role johndoe administrator')
  process.exit(0)
}

const username = args[0]
const roleId = args[1]

addRole(username, roleId).catch(error => {
  console.error('❌ Failed to add role:', error)
  process.exit(1)
})
