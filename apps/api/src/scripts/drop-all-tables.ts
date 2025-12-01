#!/usr/bin/env tsx
// Drop all tables from the database to start fresh
// DESTRUCTIVE: This will delete ALL data

import { client } from '../db/index.js'

async function dropAllTables() {
  console.log('⚠️  WARNING: This will DROP ALL TABLES and DELETE ALL DATA!\n')
  console.log('Dropping all tables...\n')

  try {
    await client.unsafe(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO kawa;
      GRANT ALL ON SCHEMA public TO public;
    `)

    console.log('✅ All tables dropped successfully!\n')
    console.log('You can now run: pnpm db:push')
  } catch (error) {
    console.error('❌ Failed to drop tables:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

dropAllTables()
