import { defineConfig } from 'vitest/config';

/**
 * Same reason `packages/logic/constructor/vitest.config.ts` exists: the aggregate `npm test` run
 * picks this package up by directory glob and reads its own config, so the raised timeout has to
 * live here too. `exportLogicProject` calls the very same `ts.Program`-building compilers, so the
 * first test in each file pays the same `lib.esnext.d.ts` parse.
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
