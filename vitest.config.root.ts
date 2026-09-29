import { defineConfig } from 'vitest/config';
import mcrCoverageOptions from './mcr.config.unit.mjs';

export default defineConfig({
  test: {
    // `packages/workflow/e2e-tests` is excluded: it's a Playwright browser e2e suite (own
    // `test`/`test.describe`, run via `npm test -w @falang/workflow-e2e-tests` → `playwright
    // test`), not a vitest project — including it here makes vitest try (and fail) to execute
    // Playwright's `test.describe()` outside of Playwright's own runner.
    // `packages/logic/e2e-tests` is excluded for a different reason: it's a real vitest project,
    // but every test in it shells out to `docker` (see ADR 0019 (private)) — requiring Docker for
    // a plain `npm test` would break the fast local-check path on any machine without it. Run it
    // explicitly with `npm test -w @falang/logic-e2e-tests`.
    projects: ['./packages/*/*', '!./packages/workflow/e2e-tests', '!./packages/logic/e2e-tests'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/temp/**', '**/.stryker-tmp/**'],
    // NOTE: per-test timeouts belong in each project's own config — with `projects`, root-level
    // `test` options don't reach them. `packages/logic/constructor/vitest.config.ts` raises its own
    // for that reason.
    coverage: {
      // Generate a report even when some test file fails — otherwise Vitest silently writes
      // nothing at all (see ADR 0012 (private), bug #1).
      reportOnFailure: true,
      // `vitest-monocart-coverage` writes `mcr`'s own portable "raw" format (in addition to the
      // human-facing `v8`/`console-details` reports) so this run's output can be merged with e2e
      // coverage by `scripts/merge-coverage.mjs` — see the ADR above. Every package's own
      // `npm run coverage -w <pkg>` keeps the plain `@vitest/coverage-v8` provider from the shared
      // `vitest.config.ts`, unaffected by this.
      provider: 'custom',
      customProviderModule: 'vitest-monocart-coverage',
      coverageReportOptions: mcrCoverageOptions,
    },
  },
});
