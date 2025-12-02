# KawaKawa Market - Development Commands

.PHONY: help install dev build db-init db-init-dev db-reset db-studio fio-sync clean kill-dev

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

dev: ## Start development servers (API + Web)
	pnpm dev

dev-api: ## Start API dev server only
	pnpm --filter @kawakawa/api dev

dev-web: ## Start Web dev server only
	pnpm --filter @kawakawa/web dev

build: ## Build all packages
	pnpm build

db-init: ## Initialize database (migrate, seed, sync FIO) - idempotent, production-ready
	pnpm --filter @kawakawa/api db:migrate
	pnpm --filter @kawakawa/api db:init

db-init-dev: ## Initialize database for development (push schema, seed, sync FIO)
	pnpm --filter @kawakawa/api db:push
	pnpm --filter @kawakawa/api db:seed
	pnpm --filter @kawakawa/api fio:sync

db-reset: ## Reset database (WARNING: deletes all data)
	docker compose down -v
	docker compose up -d
	@echo "Waiting for database to start..."
	@sleep 3
	$(MAKE) db-init-dev

db-studio: ## Open Drizzle Studio (visual database browser)
	pnpm --filter @kawakawa/api db:studio

fio-sync: ## Sync FIO data (commodities, locations, stations)
	pnpm --filter @kawakawa/api fio:sync

admin-create: ## Create an administrator user (usage: make admin-create USERNAME="admin" NAME="Admin User")
	@if [ -z "$(USERNAME)" ]; then \
		echo "Error: USERNAME is required"; \
		echo "Usage: make admin-create USERNAME=admin NAME=\"System Administrator\""; \
		exit 1; \
	fi
	pnpm --filter @kawakawa/api admin:create $(USERNAME) $(NAME)

clean: ## Clean build artifacts and node_modules
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/*/dist packages/*/dist
	rm -rf .turbo apps/*/.turbo packages/*/.turbo

kill-dev: ## Kill all running dev servers (tsx, vite, turbo)
	@echo "Killing dev servers..."
	@-pkill -f "tsx watch" 2>/dev/null || true
	@-pkill -f "vite" 2>/dev/null || true
	@-pkill -f "turbo run dev" 2>/dev/null || true
	@echo "Done. Any zombie processes will be cleaned up when VSCode restarts."
