# Thin wrappers over the pnpm scripts in package.json; those stay the source of truth.

.DEFAULT_GOAL := help
.PHONY: help install dev up down test test-integration test-e2e test-all check lint format typecheck build migrate db-generate db-status db-studio module

# Local DB is started only when no DATABASE_URL points elsewhere (e.g. Neon).
LOCAL_DB := $(if $(DATABASE_URL),,up)

help: ## List targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-18s %s\n", $$1, $$2}'

install: ## Install dependencies
	pnpm install

node_modules: package.json pnpm-lock.yaml
	pnpm install
	@touch node_modules

dev: node_modules ## Start Postgres and the web dev server (api runs alongside)
	pnpm dev

up: ## Start Postgres (docker)
	docker compose up -d --wait

down: ## Stop Postgres
	docker compose down

test: node_modules ## Unit tests
	pnpm test

test-integration: node_modules up ## Integration tests (workerd + arv_test DB)
	pnpm test:integration

test-e2e: node_modules up ## End-to-end tests (Playwright)
	pnpm test:e2e

test-all: node_modules up ## Unit, integration and e2e tests
	pnpm test:all

check: node_modules ## Pre-commit checks: lint, typecheck, unit tests
	pnpm lint && pnpm typecheck && pnpm test

lint: node_modules ## Biome + module graph check
	pnpm lint

format: node_modules ## Format with Biome
	pnpm format

typecheck: node_modules ## Typecheck all workspaces
	pnpm typecheck

build: node_modules ## Build all workspaces
	pnpm build

migrate: node_modules $(LOCAL_DB) ## Apply migrations (DATABASE_URL, default local docker DB)
	pnpm db:migrate

db-generate: node_modules ## Generate a migration from module schemas
	pnpm db:generate

db-status: node_modules $(LOCAL_DB) ## Show applied/pending migrations
	pnpm db:status

db-studio: node_modules $(LOCAL_DB) ## Open Drizzle Studio
	pnpm db:studio

module: node_modules ## Scaffold a module from modules/_template (make module name=time-off)
	@test -n "$(name)" || { echo "Usage: make module name=<kebab-case>"; exit 1; }
	pnpm new:module $(name)
