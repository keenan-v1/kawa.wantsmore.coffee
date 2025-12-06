#!/usr/bin/env tsx
// Remove a role from a user via CLI
// Usage: tsx src/scripts/admin-rm-role.ts <username> <roleId>

import { db, users, userRoles, roles } from '../db/index.js'
import { eq, and } from 'drizzle-orm'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'admin-rm-role' })

async function removeRole(username: string, roleId: string) {
  log.info({ username, roleId }, 'Removing role from user')

  // Find the user
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user) {
    log.error({ username }, 'User not found')
    process.exit(1)
  }

  // Check if user has this role
  const [existingRole] = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, roleId)))
    .limit(1)

  if (!existingRole) {
    // Show current roles
    const currentRoles = await db
      .select({ roleId: roles.id, roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id))

    log.info(
      {
        userId: user.id,
        username,
        roleId,
        currentRoles: currentRoles.map(r => r.roleId),
      },
      'User does not have role'
    )

    process.exit(0)
  }

  // Check if this would leave the user with no roles
  const allUserRoles = await db.select().from(userRoles).where(eq(userRoles.userId, user.id))

  if (allUserRoles.length === 1) {
    log.error(
      {
        userId: user.id,
        username,
        roleId,
      },
      'Cannot remove last role - users must have at least one role'
    )
    process.exit(1)
  }

  // Remove the role
  await db.delete(userRoles).where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, roleId)))

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
      removedRole: roleId,
      currentRoles: currentRoles.map(r => r.roleId),
    },
    'Role removed from user'
  )

  process.exit(0)
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length < 2 || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write('Usage: pnpm admin:rm-role <username> <roleId>\n')
  process.stdout.write('\n')
  process.stdout.write('Remove a role from a user.\n')
  process.stdout.write('\n')
  process.stdout.write('Note: Users must have at least one role to log in.\n')
  process.stdout.write('      This command will prevent you from removing the last role.\n')
  process.stdout.write('\n')
  process.stdout.write('Examples:\n')
  process.stdout.write('  pnpm admin:rm-role johndoe unverified\n')
  process.stdout.write('  pnpm admin:rm-role johndoe trade-partner\n')
  process.exit(0)
}

const username = args[0]
const roleId = args[1]

removeRole(username, roleId).catch(error => {
  log.error({ err: error }, 'Failed to remove role')
  process.exit(1)
})
