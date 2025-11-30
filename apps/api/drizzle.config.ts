import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Store migration tracking table in public schema (avoids CREATE SCHEMA permission requirement)
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
})
