# Kawakawa CX

Internal commodity exchange for [Kawakawa, Inc.](https://prosperous.universe), a corporation in the game [Prosperous Universe](https://prosperousuniverse.com/).

While the game has public commodity exchanges, this platform serves as the corporation's internal exchange where members coordinate trading and maintain fixed pricing.

## Features

- **Inventory Management** - Track and manage available inventory across all members
- **Buy/Sell Orders** - Create and fill internal orders with configurable pricing
- **FIO Integration** - Sync inventory and pricing data from [FIO](https://fio.fnar.net/)
- **Price Lists** - Maintain multiple price lists with automatic calculations
- **Discord Bot** - Manage orders and inventory directly from Discord
- **Role-based Access** - Granular permissions for different member roles

## Tech Stack

| Layer          | Technology                         |
| -------------- | ---------------------------------- |
| Frontend       | Vue 3, TypeScript, Vuetify, Vite   |
| Backend        | Node.js, Express, TSOA, TypeScript |
| Database       | PostgreSQL 17, Drizzle ORM         |
| Bot            | Discord.js                         |
| Infrastructure | Turborepo, pnpm, Docker            |
| Deployment     | DigitalOcean App Platform          |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 17 (or use the dev container)

### Development Setup (Dev Container - Recommended)

The easiest way to get started is using the dev container, which includes PostgreSQL and all dependencies pre-configured.

1. Clone the repository:

   ```bash
   git clone https://github.com/kawakawa-inc/kawakawa-cx.git
   cd kawakawa-cx
   ```

2. Open in VS Code and select **"Reopen in Container"** when prompted

3. Initialize the database:

   ```bash
   make db-init-dev
   ```

4. Start the development servers:
   ```bash
   make dev
   ```

The web app will be available at `http://localhost:5173` and the API at `http://localhost:3000`.

### Development Setup (Manual)

If not using the dev container, you'll need to configure the database connection manually.

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/kawakawa-inc/kawakawa-cx.git
   cd kawakawa-cx
   pnpm install
   ```

2. Create environment files from examples:

   ```bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   ```

3. Update `apps/api/.env` with your PostgreSQL connection:

   ```bash
   DATABASE_URL=postgresql://username:password@localhost:5432/kawa_market
   JWT_SECRET=your-secret-key  # Generate with: openssl rand -base64 32
   ```

4. Initialize and start:
   ```bash
   make db-init-dev
   make dev
   ```

## Common Commands

```bash
make dev           # Start all dev servers (API + Web + Bot)
make build         # Build all packages
make test          # Run all tests
make lint          # Check for lint errors
make format        # Format all files
make checkpoint    # Run format, lint, build, and tests
make db-studio     # Open Drizzle Studio (visual DB browser)
```

## Project Structure

```
apps/
├── api/           # REST API (Express + TSOA)
├── bot/           # Discord bot
└── web/           # Frontend (Vue 3)

packages/
├── db/            # Database schema (Drizzle)
├── services/      # Shared business logic
└── types/         # Shared TypeScript types
```

## License

[MIT](LICENSE)
