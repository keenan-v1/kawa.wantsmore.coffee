#!/usr/bin/env tsx
// Drop all tables from the database to start fresh
// DESTRUCTIVE: This will delete ALL data

import { client } from '../db/index.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ script: 'drop-all-tables' })

async function dropAllTables() {
  log.warn('Dropping all tables - this will delete ALL data')

  try {
    await client.unsafe(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO kawa;
      GRANT ALL ON SCHEMA public TO public;
    `)

    log.info('All tables dropped successfully')
    process.stdout.write('You can now run: pnpm db:push\n')
  } catch (error) {
    log.error({ err: error }, 'Failed to drop tables')
    process.exit(1)
  } finally {
    await client.end()
  }
}

dropAllTables()
