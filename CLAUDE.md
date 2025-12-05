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

### Frontend (apps/web)

```bash
pnpm dev     # Start dev server on port 5173
pnpm build   # Production build
```

### Backend (apps/api)

```bash
pnpm dev     # Start dev server with hot reload
pnpm build   # Production build
pnpm start   # Start production server

# Database commands
pnpm db:push      # Push schema to database (dev)
pnpm db:migrate   # Run migrations (production)
pnpm db:seed      # Seed initial data
pnpm db:init      # Idempotent initialization (checks if seeding needed)
pnpm db:studio    # Open Drizzle Studio (visual DB browser)

# TSOA (API route generation)
pnpm generate          # Regenerate routes and spec after changing controllers

# FIO sync commands
pnpm fio:sync                # Sync all FIO data
pnpm fio:sync:commodities    # Sync commodities only
pnpm fio:sync:locations      # Sync locations/planets only
pnpm fio:sync:stations       # Sync stations only

# Testing
pnpm test              # Run all tests
pnpm test:watch        # Run tests in watch mode
pnpm test:ui           # Run tests with interactive UI
pnpm test:coverage     # Run tests with coverage report
```

### Makefile (root)

```bash
make dev           # Start all dev servers
make fio-sync      # Sync FIO data
```

### Linting & Formatting (root)

```bash
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

3. **Run tests before committing**

   ```bash
   pnpm test  # Must pass before committing
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
│       ├── plugins/vuetify.ts   # Vuetify configuration (dark theme)
│       ├── App.vue              # Root component
│       └── main.ts              # App entry point
└── client/           # Shared client library

packages/
└── types/            # Shared TypeScript types
```
