#!/usr/bin/env bash
# Sets up the local `kind` cluster backing `docker-compose.workflow.yml`'s runner pods — see
# ADR 0016 (private)'s Phase 2 ("RunnerProcessManager" moved from
# `child_process.spawn` to k8s `Deployment`s; this is that Deployment's cluster for local dev,
# standing in for the still-blocked-on-account-verification Yandex Cloud cluster). Idempotent —
# safe to re-run after code changes to rebuild/reload the runner image.
#
# Thin wrapper around `scripts/kind-cluster-setup.sh` (shared logic — see its own header for what
# each step does and why) with this stack's cluster name, namespace, and kubeconfig path. The e2e
# stack (`docker-compose.workflow-e2e.yml`) has its own analogous wrapper,
# `scripts/kind-e2e-setup.sh`, using a *separate* cluster so both stacks stay independent.
#
# Usage: ./scripts/kind-dev-setup.sh [cluster-name]  (default: falang-workflow-dev)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec "$REPO_ROOT/scripts/kind-cluster-setup.sh" \
  "${1:-falang-workflow-dev}" \
  workflow \
  "$REPO_ROOT/docker/kind-kubeconfig.yaml"
