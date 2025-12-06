#!/usr/bin/env tsx
// Create an administrator user with a generated password
// Usage: tsx src/scripts/create-admin.ts <username> [displayName] [email]

import { db, users, userRoles, userSettings } from '../db/index.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'create-admin' })

function generatePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const randomBytes = crypto.randomBytes(length)
  let password = ''

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length]
  }

  return password
}

async function createAdmin(username: string, displayName?: string, email?: string) {
  log.info('Creating administrator account')

  // Check if user already exists
  const existingUser = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (existingUser.length > 0) {
    log.error({ username }, 'User already exists')
    process.exit(1)
  }

  // Generate a secure password
  const password = generatePassword(20)
  const passwordHash = await bcrypt.hash(password, 12) // Use 12 rounds like our utility

  // Create the user
  const [newUser] = await db
    .insert(users)
    .values({
      username,
      email: email || null,
      passwordHash,
      displayName: displayName || username,
      isActive: true,
    })
    .returning()

  log.info({ userId: newUser.id, username: newUser.username }, 'User created')

  // Create default user settings
  await db.insert(userSettings).values({
    userId: newUser.id,
  })

  log.info({ userId: newUser.id }, 'User settings created')

  // Assign administrator role
  await db.insert(userRoles).values({
    userId: newUser.id,
    roleId: 'administrator',
  })

  log.info({ userId: newUser.id, roleId: 'administrator' }, 'Administrator role assigned')

  // Output the credentials to stdout (intentionally not logged for security)
  // This is a CLI tool - the password must be shown to the user
  process.stdout.write('\n')
  process.stdout.write('='.repeat(60) + '\n')
  process.stdout.write('ADMINISTRATOR CREDENTIALS\n')
  process.stdout.write('='.repeat(60) + '\n')
  process.stdout.write(`Username: ${username}\n`)
  process.stdout.write(`Password: ${password}\n`)
  process.stdout.write('='.repeat(60) + '\n')
  process.stdout.write('\nIMPORTANT: Save this password securely!\n')
  process.stdout.write('This password will NOT be shown again.\n\n')

  process.exit(0)
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write('Usage: tsx src/scripts/create-admin.ts <username> [displayName] [email]\n')
  process.stdout.write('\n')
  process.stdout.write('Examples:\n')
  process.stdout.write('  tsx src/scripts/create-admin.ts admin\n')
  process.stdout.write('  tsx src/scripts/create-admin.ts admin "System Administrator"\n')
  process.stdout.write(
    '  tsx src/scripts/create-admin.ts admin "System Administrator" admin@example.com\n'
  )
  process.stdout.write('  pnpm admin:create admin "System Administrator" admin@example.com\n')
  process.exit(0)
}

const username = args[0]
const displayName = args[1]
const email = args[2]

createAdmin(username, displayName, email).catch(error => {
  log.error({ err: error }, 'Failed to create administrator')
  process.exit(1)
})
