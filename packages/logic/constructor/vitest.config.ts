import { defineConfig } from 'vitest/config';

/**
 * The only package-local Vitest config in this repo — every other package runs on the shared
 * `vitest.config.ts` at the repo root, and this one does too for its own `npm test -w` (its `test`
 * script passes `-c ../../../vitest.config.ts` explicitly). This file exists for the *aggregate*
 * `npm test` run instead: `vitest.config.root.ts` lists projects as directory globs, and a project
 * picked up that way reads its own config — root-level `test` options (including `testTimeout`) never
 * reach it.
 *
 * Why the raised timeout: this package's compiler type-checks every expression it translates by
 * building a real `ts.Program` (see ADR 0019 (private)), and the
 * first test in each file pays the full `lib.esnext.d.ts` parse before `compile-expression.ts`'s
 * module-level source-file cache can help — seconds on its own, and more under the parallel load of a
 * whole-repo run. Vitest's 5s default made these files flaky without ever catching a real problem.
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/temp/**', '**/.stryker-tmp/**'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
    },
  },
});
