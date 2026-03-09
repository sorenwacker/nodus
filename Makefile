# Nodus Makefile
# Development workflow automation

.PHONY: help install dev build test clean docker-dev docker-build lint fmt audit kill

# Default target
help:
	@echo "Nodus Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install      Install dependencies"
	@echo "  make docker-build Build Docker dev environment"
	@echo ""
	@echo "Development:"
	@echo "  make dev          Start development server"
	@echo "  make docker-dev   Start dev in Docker"
	@echo "  make test         Run all tests"
	@echo "  make lint         Run linters"
	@echo "  make fmt          Format code"
	@echo ""
	@echo "Build:"
	@echo "  make build        Production build"
	@echo "  make clean        Clean build artifacts"

# =============================================================================
# Setup
# =============================================================================

install:
	npm install
	cd src-tauri && cargo fetch

docker-build:
	docker-compose build

# =============================================================================
# Development
# =============================================================================

dev:
	npm run tauri dev

docker-dev:
	docker-compose up dev

# Run frontend only (no Tauri)
dev-web:
	npm run dev

# =============================================================================
# Testing
# =============================================================================

test: test-frontend test-backend

test-frontend:
	npm run test

test-backend:
	cd src-tauri && cargo test

test-watch:
	npm run test -- --watch

test-coverage:
	npm run test:coverage
	cd src-tauri && cargo tarpaulin --out Html

# Integrity test: concurrent edit simulation
test-integrity:
	cd src-tauri && cargo test watcher::tests --nocapture

# =============================================================================
# Linting & Formatting
# =============================================================================

lint: lint-frontend lint-backend

lint-frontend:
	npm run lint

lint-backend:
	cd src-tauri && cargo clippy -- -D warnings

fmt: fmt-frontend fmt-backend

fmt-frontend:
	npm run fmt

fmt-backend:
	cd src-tauri && cargo fmt

# =============================================================================
# Security Auditing
# =============================================================================

audit: audit-frontend audit-backend

audit-frontend:
	npm audit

audit-backend:
	cd src-tauri && cargo audit

audit-fix:
	npm audit fix

# =============================================================================
# Build
# =============================================================================

build:
	npm run tauri build

build-debug:
	npm run tauri build -- --debug

# =============================================================================
# Database
# =============================================================================

db-reset:
	rm -f ~/.local/share/nodus/nodus.db
	@echo "Database reset. Will be recreated on next run."

db-migrate:
	@echo "Migrations run automatically on app start"

# =============================================================================
# Clean
# =============================================================================

clean:
	rm -rf dist
	rm -rf node_modules
	cd src-tauri && cargo clean

clean-build:
	rm -rf dist
	cd src-tauri && cargo clean --release

# =============================================================================
# Documentation
# =============================================================================

docs:
	cd src-tauri && cargo doc --open

# =============================================================================
# Release
# =============================================================================

release-patch:
	npm version patch
	cd src-tauri && cargo set-version --bump patch

release-minor:
	npm version minor
	cd src-tauri && cargo set-version --bump minor

release-major:
	npm version major
	cd src-tauri && cargo set-version --bump major

# =============================================================================
# Utilities
# =============================================================================

kill:
	pkill -f vite || true
	pkill -f "tauri dev" || true
	@echo "Dev servers stopped"
