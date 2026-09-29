#!/usr/bin/env bash
# Builds and pushes every custom Docker image the workflow engine needs to run in production —
# see docker-compose.workflow.yml for the same set assembled for local dev, and
# ADR 0016 (private) for the k8s deployment this feeds
# (deploy/k8s/workflow/{backend,client}-deployment.yaml's `image: REPLACE_ME/...` placeholders,
# and RunnerProcessManager's RUNNER_IMAGE env var, both consume the image refs this script prints).
#
# Not included: docker/mocks.Dockerfile and docker/e2e-tests.Dockerfile — test-only, never run in
# production.
#
# Usage:
#   DOCKER_REGISTRY=cr.yandex/<registry-id> ./scripts/publish-docker-images.sh
#   DOCKER_REGISTRY=cr.yandex/<registry-id> ./scripts/publish-docker-images.sh --tag v1.2.3
#   DOCKER_REGISTRY=cr.yandex/<registry-id> ./scripts/publish-docker-images.sh --only backend --no-push
#
# Requires: `docker login <registry>` already done (this script doesn't handle credentials — same
# "secrets stay out of scripts" convention as this repo's .env-based compose secrets).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TAG="$(git rev-parse --short HEAD)"
PUSH=true
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="$2"
      shift 2
      ;;
    --no-push)
      PUSH=false
      shift
      ;;
    --only)
      ONLY="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${DOCKER_REGISTRY:-}" ]]; then
  echo "DOCKER_REGISTRY is not set — e.g. DOCKER_REGISTRY=cr.yandex/<registry-id> (see" >&2
  echo "ADR 0016 (private)'s \"Provider chosen: Yandex Cloud\" —" >&2
  echo "the registry itself isn't provisioned yet, this is the same REPLACE_ME gap" >&2
  echo "deploy/k8s/workflow/*-deployment.yaml already documents)." >&2
  exit 1
fi

# name:dockerfile:context — matches how each image is built in docker-compose.workflow.yml.
IMAGES=(
  "backend:docker/backend.Dockerfile:."
  "client:docker/client.Dockerfile:."
  "runner:docker/runner.Dockerfile:."
  "activepieces:activepieces/Dockerfile:./activepieces"
  "media:docker/media.Dockerfile:."
)

PUBLISHED_REFS=()

for entry in "${IMAGES[@]}"; do
  IFS=':' read -r name dockerfile context <<<"$entry"

  if [[ -n "$ONLY" && "$name" != "$ONLY" ]]; then
    continue
  fi

  repo="${DOCKER_REGISTRY}/falang-workflow-${name}"
  ref_tag="${repo}:${TAG}"
  ref_latest="${repo}:latest"

  echo ""
  echo "=== ${name} (${dockerfile}) ==="
  docker build -f "$dockerfile" -t "$ref_tag" -t "$ref_latest" "$context"

  if [[ "$PUSH" == true ]]; then
    docker push "$ref_tag"
    docker push "$ref_latest"
  else
    echo "Built (not pushed, --no-push): $ref_tag"
  fi

  PUBLISHED_REFS+=("$name=$ref_tag")
done

echo ""
echo "Done. Image refs:"
for ref in "${PUBLISHED_REFS[@]}"; do
  echo "  $ref"
done
echo ""
echo "Next steps (not done by this script):"
echo "  - Update deploy/k8s/workflow/backend-deployment.yaml and client-deployment.yaml's"
echo "    'image: REPLACE_ME/...' lines with the backend/client refs above."
echo "  - Set RUNNER_IMAGE (currently defaults to 'falang-workflow-runner:local', see"
echo "    build.module.ts) in deploy/k8s/workflow/backend-configmap.yaml to the runner ref above."
echo "  - Set deploy/k8s/workflow/media-deployment.yaml's 'image: ...' line to the media ref above"
echo "    (see ADR 0041 (private))."
