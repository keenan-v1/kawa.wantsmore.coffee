#!/usr/bin/env tsx
// Load mock data into the database
// Run with: pnpm --filter @kawakawa/api mock-data

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { client } from '../db/index.js'
import { createLogger } from '../utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const log = createLogger({ script: 'load-mock-data' })

async function loadMockData() {
  log.info('Loading mock data into database')

  try {
    // Read the SQL file
    const sqlPath = join(__dirname, 'mock-data.sql')
    const sql = readFileSync(sqlPath, 'utf-8')

    log.info({ path: sqlPath }, 'Read mock data SQL file')

    // Execute the SQL
    await client.unsafe(sql)

    log.info('Mock data loaded successfully')
    process.stdout.write('Mock data loaded! Users can login with password: password123\n')
    process.stdout.write('Admin user: admin / password123\n')
  } catch (error) {
    log.error({ err: error }, 'Failed to load mock data')
    process.exit(1)
  } finally {
    await client.end()
  }
}

loadMockData()
