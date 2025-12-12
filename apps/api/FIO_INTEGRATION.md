# FIO API Integration

This document describes the integration with the FIO (FNAR Industries) API for Prosperous Universe game data.

## Overview

FIO provides public access to game data including:

- Materials/Commodities
- Planets and Systems
- Market prices and orders
- Buildings and recipes

Base API URL: `https://rest.fnar.net/`

## Architecture

```
apps/api/src/services/fio/
├── client.ts              # HTTP client for FIO API
├── csv-parser.ts          # CSV parsing utilities
├── types.ts               # TypeScript types for FIO data
├── sync-commodities.ts    # Sync materials to commodities table
├── sync-locations.ts      # Sync planets to locations table
└── index.ts               # Exports
```

## Data Sync

### Commodities (Materials)

Syncs from `/csv/materials` endpoint to `commodities` table:

- `ticker` - Material ticker (H2O, FE, etc.)
- `name` - Material name (Water, Iron, etc.)
- `category` - Category (Agricultural, Mineral, etc.)

### Locations (Planets)

Syncs from `/csv/planets` and `/csv/systems` endpoints to `locations` table:

- `id` - Planet natural ID (UV-351a, KW-689c, etc.)
- `name` - Planet name (Benten, Katoa, etc.)
- `type` - Station or Planet (auto-detected)
- `systemCode` - System code (UV-351, KW-689, etc.)
- `systemName` - System name (Benten, Shadow Garden, etc.)

## CLI Commands

```bash
# Sync all data from FIO
pnpm --filter @kawakawa/api fio:sync

# Sync only commodities
pnpm --filter @kawakawa/api fio:sync:commodities

# Sync only locations
pnpm --filter @kawakawa/api fio:sync:locations
```

## Environment Variables

```bash
# Optional: FIO API key for private endpoints (not needed for public data)
FIO_API_KEY=your_api_key_here

# Required: Database connection
DATABASE_URL=postgres://user:pass@host:port/database
```

## Usage Example

```typescript
import { fioClient } from './services/fio'
import { syncCommodities, syncLocations } from './services/fio'

// Fetch raw data
const materials = await fioClient.getMaterials()
const planets = await fioClient.getPlanets()
const prices = await fioClient.getPrices()

// Sync to database
const commoditiesResult = await syncCommodities()
const locationsResult = await syncLocations()
```

## Data Flow

1. **Fetch** - HTTP GET from FIO API (CSV format)
2. **Parse** - Convert CSV to typed objects
3. **Transform** - Map FIO fields to database schema
4. **Upsert** - Insert new or update existing records

## Error Handling

All sync operations return a `SyncResult`:

```typescript
{
  success: boolean
  inserted: number
  updated: number
  errors: string[]
}
```

Errors are logged but don't stop the sync process. The script reports all errors at the end.

## Performance

- FIO uses CloudFlare CDN caching (no need to cache on our end)
- Batch processing (100 records at a time)
- Upsert operations (insert or update on conflict)

## Future Enhancements

- [ ] Background job scheduling (cron/worker)
- [ ] Price history tracking
- [ ] Market order monitoring
- [ ] Webhook support for real-time updates
- [ ] Delta sync (only changed records)
