#!/usr/bin/env tsx
// Remove a role from a user via CLI
// Usage: tsx src/scripts/admin-rm-role.ts <username> <roleId>

import { db, users, userRoles, roles } from '../db/index.js'
import { eq, and } from 'drizzle-orm'

async function removeRole(username: string, roleId: string) {
  console.log(`👤 Removing role '${roleId}' from user '${username}'...\n`)

  // Find the user
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user) {
    console.error(`❌ Error: User '${username}' not found`)
    process.exit(1)
  }

  // Check if user has this role
  const [existingRole] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, roleId)))
    .limit(1)

  if (!existingRole) {
    console.log(`ℹ️  User '${username}' does not have role '${roleId}'`)

    // Show current roles
    const currentRoles = await db
      .select({ roleId: roles.id, roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id))

    console.log(`\n📋 Current roles for '${username}':`)
    if (currentRoles.length === 0) {
      console.log('  (no roles)')
    } else {
      for (const r of currentRoles) {
        console.log(`  - ${r.roleId} (${r.roleName})`)
      }
    }

    process.exit(0)
  }

  // Check if this would leave the user with no roles
  const allUserRoles = await db.select().from(userRoles).where(eq(userRoles.userId, user.id))

  if (allUserRoles.length === 1) {
    console.error(`⚠️  Warning: This would leave user '${username}' with no roles!`)
    console.error('   Users must have at least one role to log in.')
    console.error('   Add another role first, or consider deactivating the user instead.')
    process.exit(1)
  }

  // Remove the role
  await db.delete(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, roleId)))

  // Get role name for display
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1)
  const roleName = role?.name || roleId

  console.log(`✅ Removed role '${roleId}' (${roleName}) from user '${username}'`)

  // Show current roles
  const currentRoles = await db
    .select({ roleId: roles.id, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id))

  console.log(`\n📋 Current roles for '${username}':`)
  if (currentRoles.length === 0) {
    console.log('  (no roles)')
  } else {
    for (const r of currentRoles) {
      console.log(`  - ${r.roleId} (${r.roleName})`)
    }
  }

  process.exit(0)
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length < 2 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: pnpm admin:rm-role <username> <roleId>')
  console.log('')
  console.log('Remove a role from a user.')
  console.log('')
  console.log('Note: Users must have at least one role to log in.')
  console.log('      This command will prevent you from removing the last role.')
  console.log('')
  console.log('Examples:')
  console.log('  pnpm admin:rm-role johndoe unverified')
  console.log('  pnpm admin:rm-role johndoe trade-partner')
  process.exit(0)
}

const username = args[0]
const roleId = args[1]

removeRole(username, roleId).catch(error => {
  console.error('❌ Failed to remove role:', error)
  process.exit(1)
})
