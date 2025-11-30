// Database connection and Drizzle instance
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Get database URL from environment
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Create postgres client
// For production: use connection pooling
// For migrations: { max: 1 } to prevent connection issues
export const client = postgres(connectionString)

// Create Drizzle instance with schema
export const db = drizzle(client, { schema })

// Export schema for use in other files
export * from './schema'
