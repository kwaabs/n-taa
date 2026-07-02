SHELL          := /bin/bash
.DEFAULT_GOAL  := help

# ─── Paths ──────────────────────────────────────────────────
INFRA_DIR      := infra
API_DIR        := services/api
WEB_DIR        := apps/web

# ─── Compose ────────────────────────────────────────────────
COMPOSE        := docker compose
COMPOSE_FILE   := $(INFRA_DIR)/docker-compose.yml
COMPOSE_ENV    := $(INFRA_DIR)/.env
DC             := $(COMPOSE) --env-file $(COMPOSE_ENV) -f $(COMPOSE_FILE)

# ─── Postgres ───────────────────────────────────────────────
POSTGRES_HOST_PORT ?= 5440
POSTGRES_DB        ?= geo
POSTGRES_PASSWORD  ?= geo_dev_pw
SUPER_USER         ?= postgres
APP_DB_USER        ?= geo_app
APP_DB_PASSWORD    ?= geo_app_dev_pw

BOOTSTRAP_SQL      := $(INFRA_DIR)/postgres/bootstrap.sql
HARDENING_SQL      := $(INFRA_DIR)/postgres/dbo_hardening.sql

# ─── Martin ─────────────────────────────────────────────────
MARTIN_HOST_PORT   ?= 5441

# ─── Help ───────────────────────────────────────────────────
.PHONY: help
help: ## Show available targets
	@echo ""
	@echo "n-taa — available make targets:"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z0-9_.-]+:.*?## / {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

# ─── Infra ──────────────────────────────────────────────────
.PHONY: infra-up
infra-up: ## Start postgres + martin
	$(DC) up -d
	@echo ""
	@echo "→ Postgres : localhost:$(POSTGRES_HOST_PORT)"
	@echo "→ Martin   : http://localhost:$(MARTIN_HOST_PORT)"

.PHONY: infra-down
infra-down: ## Stop containers (keep volumes)
	$(DC) down

.PHONY: infra-clean
infra-clean: ## Wipe containers AND volumes (DESTROYS DB)
	$(DC) down -v --remove-orphans

.PHONY: infra-ps
infra-ps: ## Show container status
	$(DC) ps

.PHONY: infra-logs
infra-logs: ## Tail all infra logs
	$(DC) logs -f --tail=100

.PHONY: infra-logs-pg
infra-logs-pg: ## Tail postgres logs
	$(DC) logs -f --tail=200 postgres

.PHONY: infra-logs-martin
infra-logs-martin: ## Tail martin logs
	$(DC) logs -f --tail=200 martin

.PHONY: infra-restart
infra-restart: ## Restart martin (e.g. after config change)
	$(DC) restart martin

# ─── Database ───────────────────────────────────────────────
.PHONY: db-psql
db-psql: ## psql as postgres (container)
	@$(DC) exec -e PGPASSWORD=$(POSTGRES_PASSWORD) postgres psql -U $(SUPER_USER) -d $(POSTGRES_DB)

.PHONY: db-psql-admin
db-psql-admin: ## psql as supabase_admin (container)
	@$(DC) exec -e PGPASSWORD=$(POSTGRES_PASSWORD) postgres psql -U supabase_admin -d $(POSTGRES_DB)

.PHONY: db-psql-app
db-psql-app: ## psql as geo_app (container)
	@$(DC) exec -e PGPASSWORD=$(APP_DB_PASSWORD) postgres psql -U $(APP_DB_USER) -d $(POSTGRES_DB)

.PHONY: db-schemas
db-schemas: ## List schemas
	@$(DC) exec -T -e PGPASSWORD=$(POSTGRES_PASSWORD) postgres psql -U $(SUPER_USER) -d $(POSTGRES_DB) -c "\dn"

.PHONY: db-tables
db-tables: ## List tables in app + dbo schemas
	@$(DC) exec -T -e PGPASSWORD=$(POSTGRES_PASSWORD) postgres psql -U $(SUPER_USER) -d $(POSTGRES_DB) -c "\dt app.*"
	@$(DC) exec -T -e PGPASSWORD=$(POSTGRES_PASSWORD) postgres psql -U $(SUPER_USER) -d $(POSTGRES_DB) -c "\dt dbo.*"

.PHONY: db-harden
db-harden: ## Add PKs on ogc_fid + GIST indexes on the_geom
	@cat $(HARDENING_SQL) | $(DC) exec -T -e PGPASSWORD=$(POSTGRES_PASSWORD) postgres psql -U supabase_admin -d $(POSTGRES_DB) -v ON_ERROR_STOP=1

.PHONY: db-bootstrap-verify
db-bootstrap-verify: ## Confirm bootstrap succeeded
	@$(DC) exec -T -e PGPASSWORD=$(POSTGRES_PASSWORD) postgres psql -U $(SUPER_USER) -d $(POSTGRES_DB) -c "\dn app; \dn dbo;"

.PHONY: db-layers-style
db-layers-style: ## Seed voltage-based styles into app.layers.style
	@cat $(INFRA_DIR)/postgres/dbo_layers_style_seed.sql | $(DC) exec -T -e PGPASSWORD=$(POSTGRES_PASSWORD) postgres psql -U supabase_admin -d $(POSTGRES_DB) -v ON_ERROR_STOP=1

# ─── Martin ─────────────────────────────────────────────────
.PHONY: martin-catalog
martin-catalog: ## Show Martin tile source catalog
	@curl -s http://localhost:$(MARTIN_HOST_PORT)/catalog | jq . || curl -s http://localhost:$(MARTIN_HOST_PORT)/catalog

.PHONY: martin-count
martin-count: ## Count Martin sources
	@curl -s http://localhost:$(MARTIN_HOST_PORT)/catalog | jq '.tiles | keys | length'

.PHONY: martin-health
martin-health: ## Ping Martin
	@curl -s -o /dev/null -w "Martin: %{http_code}\n" http://localhost:$(MARTIN_HOST_PORT)/health

# ─── Go API ─────────────────────────────────────────────────
.PHONY: api-run
api-run: ## Run the Go API
	cd $(API_DIR) && go run ./cmd/server

.PHONY: api-build
api-build: ## Build API binary
	cd $(API_DIR) && go build -o ../../bin/api ./cmd/server

.PHONY: api-tidy
api-tidy: ## go mod tidy
	cd $(API_DIR) && go mod tidy

.PHONY: api-test
api-test: ## Run Go tests
	cd $(API_DIR) && go test ./...

.PHONY: api-fmt
api-fmt: ## go fmt
	cd $(API_DIR) && go fmt ./...

.PHONY: api-vet
api-vet: ## go vet
	cd $(API_DIR) && go vet ./...

# ─── Frontend ───────────────────────────────────────────────
.PHONY: web-install
web-install: ## bun install
	cd $(WEB_DIR) && bun install

.PHONY: web-dev
web-dev: ## Vite dev server
	cd $(WEB_DIR) && bun run dev

.PHONY: web-build
web-build: ## Production build
	cd $(WEB_DIR) && bun run build

.PHONY: web-preview
web-preview: ## Preview built frontend
	cd $(WEB_DIR) && bun run preview

.PHONY: web-lint
web-lint: ## ESLint
	cd $(WEB_DIR) && bun run lint

.PHONY: web-typecheck
web-typecheck: ## tsc --noEmit
	cd $(WEB_DIR) && bunx tsc --noEmit

# ─── Aliases ────────────────────────────────────────────────
.PHONY: up
up: infra-up ## Alias for infra-up

.PHONY: down
down: infra-down ## Alias for infra-down

.PHONY: reset
reset: infra-clean infra-up ## Wipe volumes + fresh boot (auto-runs bootstrap)

.PHONY: tidy
tidy: api-tidy ## Alias for api-tidy

.PHONY: dev
dev: ## Reminder how to run the dev stack
	@echo "Two terminals:  make web-dev  |  make api-run"
