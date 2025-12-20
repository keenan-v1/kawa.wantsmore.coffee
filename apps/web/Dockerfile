# Build stage
FROM node:20-slim AS builder

# Build argument for version tracking (passed from CI/CD)
ARG COMMIT_SHA=dev
ENV COMMIT_SHA=${COMMIT_SHA}

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /app

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./

# Copy all package.json files for dependency resolution
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/services/package.json ./packages/services/
COPY packages/client/package.json ./packages/client/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files (API needed for swagger generation -> client generation)
COPY apps/api/ ./apps/api/
COPY apps/web/ ./apps/web/
COPY packages/types/ ./packages/types/
COPY packages/db/ ./packages/db/
COPY packages/services/ ./packages/services/
COPY packages/client/ ./packages/client/

# Build web and its dependencies (Turborepo handles dependency order)
# COMMIT_SHA is available as env var during build for Vite to inject into the bundle
RUN pnpm turbo run build --filter=@kawakawa/web...

# Production stage - nginx for static serving
FROM nginx:alpine AS production

# Copy custom nginx config for SPA routing
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
