#!/usr/bin/env tsx
// Reset a user's password via CLI
// Usage: tsx src/scripts/admin-password.ts <username> [newPassword]
// If no password is provided, a secure one will be generated

import { db, users } from '../db/index.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'admin-password' })

function generatePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  const randomBytes = crypto.randomBytes(length)
  let password = ''

  for (let i = 0; i < length; i++) {
    password += charset[randomBytes[i] % charset.length]
  }

  return password
}

async function resetPassword(username: string, newPassword?: string) {
  log.info({ username }, 'Resetting user password')

  // Find the user
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user) {
    log.error({ username }, 'User not found')
    process.exit(1)
  }

  // Generate or use provided password
  const password = newPassword || generatePassword(20)
  const passwordHash = await bcrypt.hash(password, 12)

  // Update the password
  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))

  log.info({ userId: user.id, username }, 'Password updated')

  // Output the credentials to stdout (intentionally not logged for security)
  process.stdout.write('\n')
  process.stdout.write('='.repeat(60) + '\n')
  process.stdout.write('NEW CREDENTIALS\n')
  process.stdout.write('='.repeat(60) + '\n')
  process.stdout.write(`Username: ${username}\n`)
  process.stdout.write(`Password: ${password}\n`)
  process.stdout.write('='.repeat(60) + '\n')

  if (!newPassword) {
    process.stdout.write('\nIMPORTANT: Save this password securely!\n')
    process.stdout.write('This password will NOT be shown again.\n\n')
  }

  process.exit(0)
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write('Usage: pnpm admin:password <username> [newPassword]\n')
  process.stdout.write('\n')
  process.stdout.write(
    "Reset a user's password. If no password is provided, a secure one will be generated.\n"
  )
  process.stdout.write('\n')
  process.stdout.write('Examples:\n')
  process.stdout.write('  pnpm admin:password johndoe              # Generate a new password\n')
  process.stdout.write('  pnpm admin:password johndoe "MyNewPass"  # Set a specific password\n')
  process.exit(0)
}

const username = args[0]
const newPassword = args[1]

resetPassword(username, newPassword).catch(error => {
  log.error({ err: error }, 'Failed to reset password')
  process.exit(1)
})
