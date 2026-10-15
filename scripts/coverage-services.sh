#!/usr/bin/env bash
# Coverage of the standalone services outside the npm workspace (`activepieces/`, `proxy/`): runs each
# service's own Vitest suite with the root's monocart provider (`scripts/vitest.config.services.mjs`,
# no new dependency in the services' lockfiles) and leaves raw `mcr` output in
# `coverage/services/<service>/raw`. Clears `coverage/services` first. A failing suite doesn't stop the
# other service, but the script exits non-zero.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$root/coverage/services"
status=0
for service in proxy activepieces; do
  cd "$root/$service" || exit 1
  if [ ! -d node_modules ]; then npm ci --no-audit --no-fund || { status=1; continue; }; fi
  SERVICE_NAME="$service" npx vitest run -c ../scripts/vitest.config.services.mjs --root . --coverage \
    --testTimeout=120000 --hookTimeout=120000 || status=1
done
exit $status
