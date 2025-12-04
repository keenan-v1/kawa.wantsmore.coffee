#!/usr/bin/env tsx
// Reset a user's password via CLI
// Usage: tsx src/scripts/admin-password.ts <username> [newPassword]
// If no password is provided, a secure one will be generated

import { db, users } from '../db/index.js'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

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
  console.log(`🔑 Resetting password for user '${username}'...\n`)

  // Find the user
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user) {
    console.error(`❌ Error: User '${username}' not found`)
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

  console.log(`✅ Password updated for user '${username}'\n`)

  // Output the credentials
  console.log('═'.repeat(60))
  console.log('🔐 NEW CREDENTIALS')
  console.log('═'.repeat(60))
  console.log(`Username: ${username}`)
  console.log(`Password: ${password}`)
  console.log('═'.repeat(60))

  if (!newPassword) {
    console.log('\n⚠️  IMPORTANT: Save this password securely!')
    console.log('   This password will NOT be shown again.\n')
  }

  process.exit(0)
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: pnpm admin:password <username> [newPassword]')
  console.log('')
  console.log(
    "Reset a user's password. If no password is provided, a secure one will be generated."
  )
  console.log('')
  console.log('Examples:')
  console.log('  pnpm admin:password johndoe              # Generate a new password')
  console.log('  pnpm admin:password johndoe "MyNewPass"  # Set a specific password')
  process.exit(0)
}

const username = args[0]
const newPassword = args[1]

resetPassword(username, newPassword).catch(error => {
  console.error('❌ Failed to reset password:', error)
  process.exit(1)
})
