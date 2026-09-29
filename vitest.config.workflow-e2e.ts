import { defineConfig } from 'vitest/config';

/**
 * Dedicated config for `*.workflow-e2e-spec.ts` files (see ADR 0018 (private)) — a plain vitest CLI filter argument
 * only narrows files that already match `include`, it doesn't widen it, so the shared `vitest.config.ts`'s default
 * `include` (`**\/*.{test,spec}.?(c|m)[jt]s?(x)`, deliberately not matching this suffix — see
 * `build-and-run.workflow-e2e-spec.ts`'s own doc comment for why) needs a separate config here rather than reusing it.
 * Used by the root `test-e2e:workflow` script, never by a package's own `npm test`/`npm run check` — needs the real
 * `docker-compose.workflow-e2e.yml` stack up and reachable (`BACKEND_URL`/`TEMPORAL_ADDRESS`, see
 * `workflow-e2e-client.ts`).
 */
export default defineConfig({
  test: {
    include: ['packages/*/*/src/**/*.workflow-e2e-spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/temp/**', '**/.stryker-tmp/**'],
    // Vitest parallelizes test *files* across workers by default — fine for hermetic unit tests,
    // but every workflow-tier spec here drives the same real, resource-constrained shared stack
    // (one `backend` container, one `kind` cluster/node, one Temporal server): running every file's
    // pod-starting/polling test concurrently starves them of CPU and caused real, live-verified
    // failures (a `beforeAll`'s login hook timing out at the default 10s, and ActivePieces polling
    // trigger tests timing out at 60s) that disappeared once serialized. One file at a time trades
    // wall-clock time for reliability, which is the right call for a suite this heavy.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
