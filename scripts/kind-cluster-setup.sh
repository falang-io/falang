#!/usr/bin/env bash
# Generic local-`kind`-cluster setup, backing whichever compose stack calls it with the runner
# pods `RunnerProcessManager` creates — see ADR 0016 (private)'s
# Phase 2. Not meant to be run directly; use the per-stack wrappers instead:
#   - `scripts/kind-dev-setup.sh`  → backs `docker-compose.workflow.yml` (cluster
#     `falang-workflow-dev`, kubeconfig `docker/kind-kubeconfig.yaml`).
#   - `scripts/kind-e2e-setup.sh`  → backs `docker-compose.workflow-e2e.yml` (cluster
#     `falang-workflow-e2e`, kubeconfig `docker/kind-kubeconfig-e2e.yaml`), kept as a *separate*
#     cluster so the e2e stack stays fully isolated from — and runnable alongside — the dev one,
#     matching that compose file's own isolation-by-duplication design (distinct containers/
#     network/volumes/host ports). `kind` puts every cluster's nodes on the same shared `kind`
#     docker network by default regardless of cluster name, so both wrappers' gateway-IP detection
#     below resolves to the same value on a given machine.
#
# Usage: ./scripts/kind-cluster-setup.sh <cluster-name> <namespace> <kubeconfig-out-path>
# Idempotent — safe to re-run after code changes to rebuild/reload the runner image.
#
# What this does, and why each step exists:
#   1. Creates the kind cluster if it doesn't already exist.
#   2. Creates the k8s namespace `RunnerProcessManager` creates pods in (`K8S_NAMESPACE`, see
#      `build.module.ts`).
#   3. Builds `docker/runner.Dockerfile` and loads it into this cluster's nodes — pods can only
#      pull images kind already has locally (no registry involved for local dev/e2e).
#   4. Writes the kubeconfig path given: a copy of this cluster's kubeconfig with the API server
#      address rewritten from `127.0.0.1:<random-port>` (host-only, per kind's own default —
#      confirmed via `docker port <control-plane>`) to the control-plane container's own name on
#      the `kind` docker network, which the calling compose file's `backend` service must also be
#      attached to — so the containerized backend can reach the API server the same way `kubectl`
#      on the host does via `~/.kube/config`, just from inside a container instead.
#   5. Prints the `kind` docker network's gateway IP — the containerized `backend`/`temporal`/
#      `app-postgres` services stay on the compose file's own network, a *different* docker network
#      than `kind`, but each publishes its port to the *host*; from inside a pod (which lives on the
#      `kind` network), that gateway IP reaches anything published on the host's ports, the same way
#      `docker port`-published container ports normally work. Set `KIND_GATEWAY_IP` to this value
#      before `docker compose up`/`run` if it differs from the `172.18.0.1` default baked into the
#      compose files (it will, on a machine with other docker networks already claiming that
#      subnet).

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <cluster-name> <namespace> <kubeconfig-out-path>" >&2
  exit 1
fi

CLUSTER_NAME="$1"
NAMESPACE="$2"
KUBECONFIG_OUT="$3"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"; then
  echo "Creating kind cluster '$CLUSTER_NAME'..."
  kind create cluster --name "$CLUSTER_NAME"
else
  echo "kind cluster '$CLUSTER_NAME' already exists, reusing it."
  # After a host reboot / Docker restart, kind's control-plane container gets a new random host
  # port for the API server, but the `kind-$CLUSTER_NAME` context already in ~/.kube/config keeps
  # the old one — the next `kubectl` call below would fail with
  # "dial tcp 127.0.0.1:<old-port>: connect: connection refused" (hit for real on 2026-09-19).
  # Re-exporting refreshes that context to the container's current port.
  kind export kubeconfig --name "$CLUSTER_NAME"
fi

kubectl --context "kind-$CLUSTER_NAME" create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl --context "kind-$CLUSTER_NAME" apply -f -

echo "Building and loading the runner image..."
docker build -f "$REPO_ROOT/docker/runner.Dockerfile" -t falang-workflow-runner:local "$REPO_ROOT"
kind load docker-image falang-workflow-runner:local --name "$CLUSTER_NAME"

echo "Writing $KUBECONFIG_OUT for the containerized backend..."
CONTROL_PLANE="${CLUSTER_NAME}-control-plane"
kind get kubeconfig --name "$CLUSTER_NAME" \
  | sed "s#server: https://127.0.0.1:[0-9]*#server: https://${CONTROL_PLANE}:6443#" \
  > "$KUBECONFIG_OUT"

# Docker's `--format` Go templates don't have a `contains`/string-matching function available, so
# picking the IPv4 (not IPv6) gateway out of a dual-stack network's IPAM config is done in Python
# instead of a template expression.
GATEWAY_IP="$(docker network inspect kind --format '{{json .IPAM.Config}}' | python3 -c '
import json, sys
for entry in json.load(sys.stdin):
    if ":" not in entry.get("Subnet", ""):
        print(entry["Gateway"])
        break
')"

echo
echo "Done. kind cluster '$CLUSTER_NAME' is ready, namespace '$NAMESPACE' exists, and the runner"
echo "image is loaded. Kubeconfig for the containerized backend: $KUBECONFIG_OUT"
echo "kind network gateway IP: $GATEWAY_IP"
if [ "$GATEWAY_IP" != "172.18.0.1" ]; then
  echo "This differs from the compose files' built-in default (172.18.0.1) — export"
  echo "KIND_GATEWAY_IP=$GATEWAY_IP before 'docker compose up'/'run' so backend/runner pods can"
  echo "reach Temporal and backend's internal API."
fi
