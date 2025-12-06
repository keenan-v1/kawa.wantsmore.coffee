#!/usr/bin/env tsx
// Add a role to a user via CLI
// Usage: tsx src/scripts/admin-add-role.ts <username> <roleId>

import { db, users, userRoles, roles } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'admin-add-role' })

async function addRole(username: string, roleId: string) {
  log.info({ username, roleId }, 'Adding role to user')

  // Find the user
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user) {
    log.error({ username }, 'User not found')
    process.exit(1)
  }

  // Check if the role exists
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1)

  if (!role) {
    const allRoles = await db.select().from(roles)
    log.error({ roleId, availableRoles: allRoles.map(r => r.id) }, 'Role not found')
    process.exit(1)
  }

  // Check if user already has this role
  const [existingRole] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, roleId)))
    .limit(1)

  if (existingRole) {
    log.info({ userId: user.id, username, roleId, roleName: role.name }, 'User already has role')
    process.exit(0)
  }

  // Add the role
  await db.insert(userRoles).values({
    userId: user.id,
    roleId: roleId,
  })

  // Get current roles
  const currentRoles = await db
    .select({ roleId: roles.id, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id))

  log.info(
    {
      userId: user.id,
      username,
      addedRole: roleId,
      currentRoles: currentRoles.map(r => r.roleId),
    },
    'Role added to user'
  )

  process.exit(0)
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length < 2 || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write('Usage: pnpm admin:add-role <username> <roleId>\n')
  process.stdout.write('\n')
  process.stdout.write('Add a role to a user.\n')
  process.stdout.write('\n')
  process.stdout.write('Available roles:\n')
  process.stdout.write('  - unverified    New registrations awaiting approval\n')
  process.stdout.write('  - applicant     Approved but not yet a full member\n')
  process.stdout.write('  - member        Full member with internal order access\n')
  process.stdout.write('  - lead          Lead with both internal and partner access\n')
  process.stdout.write('  - trade-partner External trade partner\n')
  process.stdout.write('  - administrator System administrator\n')
  process.stdout.write('\n')
  process.stdout.write('Examples:\n')
  process.stdout.write('  pnpm admin:add-role johndoe member\n')
  process.stdout.write('  pnpm admin:add-role johndoe administrator\n')
  process.exit(0)
}

const username = args[0]
const roleId = args[1]

addRole(username, roleId).catch(error => {
  log.error({ err: error }, 'Failed to add role')
  process.exit(1)
})
