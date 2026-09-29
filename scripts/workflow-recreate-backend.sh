#!/usr/bin/env bash
# Full rebuild + restart of the workflow backend container against the local dev stack
# (docker-compose.workflow.yml, `backend` service) — no cache reuse beyond Docker's own layer
# cache, so a source change always makes it into the running container (the backend image bakes
# its source in at build time via COPY, there's no bind mount / hot reload from the host).
#
# Assumes the dev stack is already up (`npm run start-workflow` / `docker compose -f
# docker-compose.workflow.yml up -d`) and the `kind` cluster it depends on already exists (see
# scripts/kind-dev-setup.sh, which also generates docker/kind-kubeconfig.yaml — mounted read-only
# into this container so `RunnerProcessManager` can reach the k8s API server) — this script only
# touches the `backend` service.
#
# Usage: ./scripts/workflow-recreate-backend.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE=docker-compose.workflow.yml

docker compose -f "$COMPOSE_FILE" build backend
docker compose -f "$COMPOSE_FILE" up -d --force-recreate backend
