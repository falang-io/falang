import { defineConfig } from 'vitest/config';

/**
 * Dedicated config for `*.local-e2e-spec.ts` files (ADR 0072 (private)): the whole product started in-process by
 * `startLocalMode` (PGlite, disk storage, process runners, the `temporal` CLI dev server) — no Docker. See
 * `build-and-run.workflow-e2e-spec.ts` for why the suffix deliberately does not match Vitest's default `include`.
 * Run via the root `npm run test-e2e:local`.
 */
export default defineConfig({
  test: {
    include: ['packages/workflow/local/src/**/*.local-e2e-spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/temp/**', '**/.stryker-tmp/**'],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 180_000,
  },
});
