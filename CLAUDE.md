# Kawakawa CX

## Project Overview

Full-stack internal commodity exchange for Kawakawa, Inc., a fictional corporation in the game **Prosperous Universe**. While the game has public commodity exchanges, this website serves the corporation's internal exchange where members coordinate and keep prices fixed.

## Tech Stack

### Frontend

- **Vue 3** with **TypeScript**
- **Vite** as build tool
- **Vuetify** for UI components

### Backend

- **Node.js 20+** with **TypeScript**
- **Express** with **TSOA** for type-safe REST API
- **PostgreSQL 17** with **Drizzle ORM**
- **Vitest** for unit testing
- **FIO REST API** integration (Prosperous Universe game data)
  - API Spec: https://doc.fnar.net/api.json
  - Base URL: https://rest.fnar.net
  - Per-user API keys (users provide their own FIO credentials)

### Infrastructure

- **Turborepo** monorepo structure
- **pnpm** package management
- **Dev container** with PostgreSQL
- **DigitalOcean App Platform** for deployment

## Phases

### Phase 1

#### Front End

- Account logins and registration
- Account management
- Available inventory management
- Demand management
- List inventories of participating members with pricing

#### Back End

- FIO integration
- Google Sheets integration (KAWA Price data)
- Inventory management
- Account management

### Phase 2

#### Front End & Back End

- Burn tracking & Configure what bases to include or exclude
- Consumable and Input supply and demand reporting based on Burn and inventory

## Development

All commands should be run from the repository root using `pnpm --filter` syntax.

### Makefile (recommended)

```bash
make dev           # Start all dev servers (API + Web)
make dev-api       # Start API dev server only
make dev-web       # Start Web dev server only
make build         # Build all packages
make test          # Run all tests
make lint          # Check for lint errors
make lint-fix      # Fix auto-fixable lint errors
make format        # Format all files with Prettier
make format-check  # Check formatting without modifying
make db-init       # Initialize database (production - migrate + seed)
make db-init-dev   # Initialize database (dev - push + seed + FIO sync)
make db-reset      # Reset database (WARNING: deletes all data)
make db-studio     # Open Drizzle Studio (visual DB browser)
make fio-sync      # Sync FIO data (commodities, locations, stations)
make clean         # Clean build artifacts and node_modules
make kill-dev      # Kill all running dev servers
```

### Direct pnpm commands

```bash
# Frontend (apps/web)
pnpm --filter @kawakawa/web dev       # Start dev server on port 5173
pnpm --filter @kawakawa/web build     # Production build

# Backend (apps/api)
pnpm --filter @kawakawa/api dev       # Start dev server with hot reload
pnpm --filter @kawakawa/api build     # Production build
pnpm --filter @kawakawa/api start     # Start production server

# Database commands
pnpm --filter @kawakawa/api db:push      # Push schema to database (dev)
pnpm --filter @kawakawa/api db:migrate   # Run migrations (production)
pnpm --filter @kawakawa/api db:seed      # Seed initial data
pnpm --filter @kawakawa/api db:init      # Idempotent initialization
pnpm --filter @kawakawa/api db:studio    # Open Drizzle Studio

# TSOA (API route generation)
pnpm --filter @kawakawa/api tsoa:generate    # Regenerate routes and spec

# FIO sync commands
pnpm --filter @kawakawa/api fio:sync              # Sync all FIO data
pnpm --filter @kawakawa/api fio:sync:commodities  # Sync commodities only
pnpm --filter @kawakawa/api fio:sync:locations    # Sync locations/planets only
pnpm --filter @kawakawa/api fio:sync:stations     # Sync stations only

# Testing
pnpm --filter @kawakawa/api test              # Run all tests
pnpm --filter @kawakawa/api test:watch        # Run tests in watch mode
pnpm --filter @kawakawa/api test:ui           # Run tests with interactive UI
pnpm --filter @kawakawa/api test:coverage     # Run tests with coverage report

# Linting & Formatting (root)
pnpm lint          # Check for lint errors
pnpm lint:fix      # Fix auto-fixable lint errors
pnpm format        # Format all files with Prettier
pnpm format:check  # Check formatting without modifying
```

## Testing Philosophy

**All new code must include unit tests.** We use Vitest for fast, modern testing with excellent TypeScript support.

### Testing Guidelines

1. **Write tests for all controllers and business logic**
   - Test happy paths and error cases
   - Mock database connections for speed
   - Verify data transformations and filtering logic

2. **Test Coverage Goals**
   - Controllers: 100%
   - Business logic: 100%
   - Database queries: Mock and verify calls
   - Integration points: Mock external APIs

3. **Run format, lint, and tests before committing**

   ```bash
   make lint
   make format
   make test  # Must pass before committing
   ```

4. **Test file naming**: `[filename].test.ts` alongside source files

See [apps/api/src/controllers/](apps/api/src/controllers/) for examples of well-tested controllers.

## Project Structure

### Monorepo Layout

```
apps/
├── api/               # Backend API
│   ├── src/
│   │   ├── controllers/      # API endpoints (with .test.ts files)
│   │   ├── db/               # Database schema and connection
│   │   ├── services/         # Business logic and FIO integration
│   │   ├── scripts/          # Database initialization scripts
│   │   └── generated/        # TSOA-generated routes
│   ├── drizzle/             # Database migrations
│   └── vitest.config.ts     # Test configuration
├── web/              # Frontend (Vue 3)
│   └── src/
│       ├── components/          # Reusable Vue components
│       │   ├── KeyValueAutocomplete.vue  # Searchable dropdown with key-priority matching
│       │   └── OrderDialog.vue           # Buy/sell order creation dialog
│       ├── views/               # Page components
│       ├── services/            # API and business logic services
│       ├── stores/              # Pinia stores (user state)
│       ├── plugins/vuetify.ts   # Vuetify configuration (dark theme)
│       ├── App.vue              # Root component
│       └── main.ts              # App entry point
└── client/           # Shared API client library

packages/
└── types/            # Shared TypeScript types
```
