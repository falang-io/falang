# Sourced (`. ./scripts/temporal-e2e-env.sh`, POSIX sh) by `npm run test-e2e` / `coverage:e2e` before
# `docker compose -f docker-compose.workflow-e2e.yml`, from the repository root.
#
# Generates (once) the RS256 key the e2e stack's `backend` signs Temporal JWTs with and exports it as
# TEMPORAL_JWT_PRIVATE_KEY (PEM, PKCS#8) — read by docker-compose.workflow-e2e.yml (backend) and, in
# the same shell, by the host-side workflow-tier Vitest run (temporal-isolation.workflow-e2e-spec.ts mints
# tokens with it). Gitignored file, e2e-only key: never reuse it anywhere else. ADR 0057 (private).
TEMPORAL_E2E_KEY_FILE="${TEMPORAL_E2E_KEY_FILE:-docker/temporal/e2e-jwt-private.pem}"
if [ ! -s "$TEMPORAL_E2E_KEY_FILE" ]; then
  mkdir -p "$(dirname "$TEMPORAL_E2E_KEY_FILE")"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$TEMPORAL_E2E_KEY_FILE" 2>/dev/null
  chmod 600 "$TEMPORAL_E2E_KEY_FILE"
fi
TEMPORAL_JWT_PRIVATE_KEY="$(cat "$TEMPORAL_E2E_KEY_FILE")"
export TEMPORAL_JWT_PRIVATE_KEY
# The host-side workflow-tier Vitest run talks to the same authorized Temporal (workflow-e2e-client.ts),
# so it needs the stack's mode too, not the tokenless `shared` default.
TEMPORAL_TENANT_ISOLATION=per-project
export TEMPORAL_TENANT_ISOLATION
