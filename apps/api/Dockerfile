# Build stage
FROM node:20-slim AS builder

# Build argument for version tracking (passed from CI/CD)
ARG COMMIT_SHA=dev

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./

# Copy all package.json files for dependency resolution
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/services/package.json ./packages/services/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY apps/api/ ./apps/api/
COPY packages/types/ ./packages/types/
COPY packages/db/ ./packages/db/
COPY packages/services/ ./packages/services/

# Build API and its dependencies (Turborepo handles dependency order)
RUN pnpm turbo run build --filter=@kawakawa/api...

# Production stage
FROM node:20-slim AS production

# Re-declare build arg and set as environment variable
ARG COMMIT_SHA=dev
ENV COMMIT_SHA=${COMMIT_SHA}

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy package.json files
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/services/package.json ./packages/services/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/services/dist ./packages/services/dist

# Copy drizzle migrations for runtime migrations
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run from the app root (monorepo structure preserved)
CMD ["node", "apps/api/dist/index.js"]
