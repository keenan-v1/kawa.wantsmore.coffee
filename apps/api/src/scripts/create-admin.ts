#!/usr/bin/env tsx
// Create an administrator user with a generated password
// Usage: tsx src/scripts/create-admin.ts <username> [displayName] [email]

import { db, users, userRoles, userSettings } from '../db/index.js'
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

async function createAdmin(username: string, displayName?: string, email?: string) {
  console.log('🔑 Creating administrator account...\n')

  // Check if user already exists
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)

  if (existingUser.length > 0) {
    console.error(`❌ Error: User '${username}' already exists`)
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

  console.log(`✅ User created:`)
  console.log(`   ID: ${newUser.id}`)
  console.log(`   Username: ${newUser.username}`)
  console.log(`   Display Name: ${newUser.displayName}`)
  if (newUser.email) {
    console.log(`   Email: ${newUser.email}`)
  }
  console.log()

  // Create default user settings
  await db.insert(userSettings).values({
    userId: newUser.id,
  })

  console.log(`✅ User settings created\n`)

  // Assign administrator role
  await db.insert(userRoles).values({
    userId: newUser.id,
    roleId: 'administrator',
  })

  console.log(`✅ Administrator role assigned\n`)

  // Output the credentials
  console.log('═'.repeat(60))
  console.log('🔐 ADMINISTRATOR CREDENTIALS')
  console.log('═'.repeat(60))
  console.log(`Username: ${username}`)
  console.log(`Password: ${password}`)
  console.log('═'.repeat(60))
  console.log('\n⚠️  IMPORTANT: Save this password securely!')
  console.log('   This password will NOT be shown again.\n')

  process.exit(0)
}

// Parse command line arguments
const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: tsx src/scripts/create-admin.ts <username> [displayName] [email]')
  console.log('')
  console.log('Examples:')
  console.log('  tsx src/scripts/create-admin.ts admin')
  console.log('  tsx src/scripts/create-admin.ts admin "System Administrator"')
  console.log('  tsx src/scripts/create-admin.ts admin "System Administrator" admin@example.com')
  console.log('  pnpm admin:create admin "System Administrator" admin@example.com')
  process.exit(0)
}

const username = args[0]
const displayName = args[1]
const email = args[2]

createAdmin(username, displayName, email).catch(error => {
  console.error('❌ Failed to create administrator:', error)
  process.exit(1)
})
