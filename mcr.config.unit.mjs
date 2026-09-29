// Coverage options shared between `vitest.config.root.ts` (unit tests, via `vitest-monocart-coverage`)
// and `scripts/merge-coverage.mjs` (final merge with e2e coverage) — see
// ADR 0012 (private).
export default {
  name: 'Unit Coverage Report',
  outputDir: './coverage/unit',
  reports: ['raw', 'v8', 'console-details'],
  entryFilter: {
    '**/node_modules/**': false,
    '**/*': true,
  },
};
