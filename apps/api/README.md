# Kawakawa CX API

Backend API for the Kawakawa internal commodity exchange.

## Quick Start

### 1. Database Setup (Dev Container)

The dev container automatically starts a PostgreSQL 17 database. To initialize it:

```bash
# Push schema to database
pnpm db:push

# Seed initial roles
pnpm db:seed

# Sync FIO data (commodities, planets, stations)
pnpm fio:sync
```

### 2. Development

```bash
# Start dev server with hot reload
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## Database Commands

```bash
# Generate migration files
pnpm db:generate

# Push schema directly (dev only)
pnpm db:push

# Run migrations (production)
pnpm db:migrate

# Open Drizzle Studio (visual DB browser)
pnpm db:studio

# Seed database
pnpm db:seed
```

## FIO Sync Commands

Sync game data from FIO (Prosperous Universe):

```bash
# Sync everything
pnpm fio:sync

# Sync only commodities
pnpm fio:sync:commodities

# Sync only planets
pnpm fio:sync:locations

# Sync only stations
pnpm fio:sync:stations
```

## User Management

### Create Administrator

Create an administrator user with an auto-generated secure password:

```bash
# Local development
pnpm admin:create <username> [displayName]

# Example
pnpm admin:create admin "System Administrator"
```

### Production (DigitalOcean)

Use `doctl` to create an administrator on your deployed app:

```bash
# Get your app ID (one-time lookup)
doctl apps list

# Create admin user on production
doctl apps run <app-id> --component api -- pnpm admin:create admin "System Administrator"
```

**Important**: The command will output a generated password. Save it securely - it won't be shown again.

## Environment Variables

See [.env.example](../../.env.example) for required environment variables.

For dev container, `DATABASE_URL` is automatically set.

## Database Schema

- **users** - User accounts with authentication
- **roles** - Application roles (applicant, member, lead, trade-partner, administrator)
- **user_roles** - Many-to-many user ↔ roles
- **commodities** - Materials from FIO (synced from `/csv/materials`)
- **locations** - Planets and stations (synced from `/csv/planets` and `/global/comexexchanges`)
- **inventory** - User inventory items
- **demands** - User purchase requests
- **market_listings** - Items available for sale

## Testing Integration with Database

```bash
# Start services
docker compose up -d

# Initialize database
pnpm db:push
pnpm db:seed
pnpm fio:sync

# Run tests (when implemented)
pnpm test

# Clean up
docker compose down -v  # Remove volumes to reset database
```

## Drizzle Studio

Visual database browser on http://localhost:4983

```bash
pnpm db:studio
```

## Production Deployment

See [FIO_INTEGRATION.md](./FIO_INTEGRATION.md) for details.

For DigitalOcean:

1. Database is automatically provisioned via [.do/app.yaml](../../.do/app.yaml)
2. Run migrations on first deploy
3. Set up cron job or scheduled task for `fio:sync`
