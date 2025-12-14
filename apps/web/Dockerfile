# Build stage
FROM node:20-slim AS builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

# Copy all package.json files for dependency resolution
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/client/package.json ./packages/client/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files (API needed for swagger generation)
COPY apps/api/ ./apps/api/
COPY apps/web/ ./apps/web/
COPY packages/types/ ./packages/types/
COPY packages/client/ ./packages/client/

# Build (Turborepo handles dependency order: types -> api (swagger) -> client -> web)
RUN pnpm --filter @kawakawa/web build

# Production stage - nginx for static serving
FROM nginx:alpine AS production

# Copy custom nginx config for SPA routing
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
