SHELL := /bin/bash
.DEFAULT_GOAL := help

VENV := .venv
PY := $(VENV)/bin/python
PYTEST := $(VENV)/bin/pytest
ENV_FILE ?= .env
# Engine URL: taken from the env file's ENGINE_URL when present (default http://127.0.0.1:8000).
ENGINE_URL ?= $(shell grep -E '^ENGINE_URL=' $(ENV_FILE) 2>/dev/null | head -1 | cut -d= -f2-)
ENGINE_URL := $(if $(ENGINE_URL),$(ENGINE_URL),http://127.0.0.1:8000)
# Engine port: taken from the env file's PORT when present (default 8000).
PORT ?= $(shell grep -E '^PORT=' $(ENV_FILE) 2>/dev/null | head -1 | cut -d= -f2)
PORT := $(if $(PORT),$(PORT),8000)

.PHONY: help setup venv node test test-integration deploy-local kairos-keys deploy-kairos \
        train engine web web-prod-env deploy-web sim docker-engine

help:
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-18s %s\n", $$1, $$2}'

setup: venv ## Install contracts, web (npm) and engine/sim (venv) dependencies
	cd contracts && npm install
	cd web && npm install
	@test -f .env || cp .env.example .env
	@test -f web/.env.local || cp web/.env.example web/.env.local

venv:
	@if [ ! -x $(PY) ]; then \
	  if command -v python3.11 >/dev/null 2>&1; then python3.11 -m venv $(VENV); \
	  elif command -v uv >/dev/null 2>&1; then uv venv --python 3.11 $(VENV); \
	  else echo "python3.11 or uv is required" && exit 1; fi; \
	fi
	$(PY) -m pip install --quiet --upgrade pip 2>/dev/null || true
	@if $(PY) -m pip --version >/dev/null 2>&1; then \
	  $(PY) -m pip install --quiet -r engine/requirements.txt -r sim/requirements.txt; \
	else \
	  uv pip install --python $(PY) -r engine/requirements.txt -r sim/requirements.txt; \
	fi

node: ## Start the local Hardhat node
	cd contracts && npx hardhat node

test: ## Contract tests + engine unit tests (integration excluded)
	cd contracts && npx hardhat test
	$(PYTEST) engine/tests -q -m "not integration"

test-integration: ## Attest-to-payment integration test (needs node + engine running)
	@curl -sf $(ENGINE_URL)/health >/dev/null || (echo "engine not reachable at $(ENGINE_URL); run make node, make deploy-local, make engine" && exit 1)
	ENV_FILE=$(ENV_FILE) ENGINE_URL=$(ENGINE_URL) $(PYTEST) engine/tests -q -s -m integration

deploy-local: ## Deploy + seed on localhost, refresh shared/
	cd contracts && ENV_FILE=$(ENV_FILE) npx hardhat run scripts/deploy.ts --network localhost \
	  && ENV_FILE=$(ENV_FILE) npx hardhat run scripts/seed.ts --network localhost \
	  && ENV_FILE=$(ENV_FILE) npx hardhat run scripts/write-shared.ts --network localhost

kairos-keys: ## Generate .env.kairos with fresh testnet keys (no-op if it exists)
	@echo "TODO"

deploy-kairos: ## Deploy + seed on Kaia Kairos using .env.kairos
	@echo "TODO"

train: ## Generate synthetic data and train risk/boost models
	$(PY) -m engine.synth --seed 42 --out data/
	$(PY) -m engine.train_risk
	$(PY) -m engine.train_boost

engine: ## Run the FastAPI engine with reload
	ENV_FILE=$(ENV_FILE) $(VENV)/bin/uvicorn engine.main:app --reload --host 127.0.0.1 --port $(PORT)

web: ## Run the Next.js dev server
	cd web && npm run dev

web-prod-env: ## Write web/.env.production.local from .env.kairos (ENGINE_URL=...)
	@echo "TODO"

deploy-web: ## Build locally and deploy prebuilt output to Vercel
	@echo "TODO"

sim: ## Run the simulation and copy results into web/public/sim
	@echo "TODO"

docker-engine: ## Build and run the engine Docker image
	@echo "TODO"
