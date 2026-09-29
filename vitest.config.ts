import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/temp/**', '**/.stryker-tmp/**'],
    // Raised from Vitest's own 5s default: `@falang/logic-constructor`'s tests each build a real
    // `ts.Program` (the compiler type-checks every expression it translates, see
    // ADR 0019 (private)), and the first test in each file pays the
    // full lib-declaration parse before the module-level cache in `compile-expression.ts` can help —
    // several seconds on its own, and more under the parallel load of a whole-repo run. 5s made those
    // files flaky rather than catching anything real.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
    },
  },
});
