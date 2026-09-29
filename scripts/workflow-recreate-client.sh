#!/usr/bin/env bash
# Full rebuild + restart of the workflow client container against the local dev stack
# (docker-compose.workflow.yml, `client` service) — no cache reuse beyond Docker's own layer
# cache, so a source change always makes it into the running container (the client image bakes
# its source in at build time via COPY, there's no bind mount / hot reload from the host).
#
# Assumes the dev stack is already up (`npm run start-workflow` / `docker compose -f
# docker-compose.workflow.yml up -d`) and the `kind` network it depends on already exists (see
# scripts/kind-dev-setup.sh) — this script only touches the `client` service.
#
# Usage: ./scripts/workflow-recreate-client.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE=docker-compose.workflow.yml

docker compose -f "$COMPOSE_FILE" build client
docker compose -f "$COMPOSE_FILE" up -d --force-recreate client
