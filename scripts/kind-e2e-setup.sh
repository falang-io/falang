#!/usr/bin/env bash
# Sets up the local `kind` cluster backing `docker-compose.workflow-e2e.yml`'s runner pods — see
# ADR 0016 (private)'s Phase 2 ("Implementation notes (Phase 2, e2e
# suite migrated to kind)"). Run automatically by `npm run test-e2e`/`coverage:e2e` (root
# package.json) before `docker compose up`/`run`, so the e2e suite stays a single command; run it
# manually only when debugging the cluster directly.
#
# A *separate* cluster from the dev one (`falang-workflow-dev`), so this stack stays fully
# isolated from — and runnable alongside — `docker-compose.workflow.yml`, matching that compose
# file's own isolation-by-duplication design (distinct containers/network/volumes/host ports, see
# its header comment). Thin wrapper around `scripts/kind-cluster-setup.sh` (shared logic — see its
# own header for what each step does and why) with this stack's cluster name, namespace, and
# kubeconfig path.
#
# Usage: ./scripts/kind-e2e-setup.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec "$REPO_ROOT/scripts/kind-cluster-setup.sh" \
  falang-workflow-e2e \
  workflow \
  "$REPO_ROOT/docker/kind-kubeconfig-e2e.yaml"
