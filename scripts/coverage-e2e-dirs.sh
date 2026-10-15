#!/usr/bin/env bash
# Manages the two host directories the e2e containers write raw coverage into
# (`coverage/e2e-node` — `backend`, its build workers and runner pods; `coverage/e2e-browser` —
# Playwright's Chromium CDP coverage), see ADR 0012 (private).
#
# The containers run as root and Node writes its `NODE_V8_COVERAGE` files with mode 600, so on the
# host both directories end up root-owned and partly unreadable: `vitest --coverage` then fails to
# clean them (EACCES) and `scripts/merge-coverage.mjs` can't read them. Both steps go through a
# throwaway container, since the host user may not have sudo.
#
#   prepare   remove whatever a previous run left (stale files would leak into the next merge)
#   finalize  hand the files to the current host user and make them readable
set -euo pipefail

cd "$(dirname "$0")/.."
DIRS=(coverage/e2e-node coverage/e2e-browser)
IMAGE="${COVERAGE_DIRS_IMAGE:-alpine:3.20}"

case "${1:-}" in
  prepare)
    for dir in "${DIRS[@]}"; do
      if [ -e "$dir" ]; then
        docker run --rm -v "$PWD/coverage:/coverage" "$IMAGE" rm -rf "/coverage/$(basename "$dir")"
      fi
      mkdir -p "$dir"
    done
    ;;
  finalize)
    for dir in "${DIRS[@]}"; do
      [ -e "$dir" ] || continue
      docker run --rm -v "$PWD/$dir:/target" "$IMAGE" \
        sh -c "chown -R $(id -u):$(id -g) /target && chmod -R u+rwX,go+rX /target"
    done
    ;;
  *)
    echo "usage: $0 prepare|finalize" >&2
    exit 2
    ;;
esac
