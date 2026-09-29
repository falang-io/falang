// Coverage options for the browser (client) side of the e2e suite — collected via Playwright's
// Chromium CDP `page.coverage` API (see `tests/fixtures.ts`'s `collectCoverage` fixture) and
// merged with unit + backend/runner coverage by the root `scripts/merge-coverage.mjs`. See
// ADR 0012 (private).
export default {
  name: 'E2E Browser Coverage Report',
  outputDir: './coverage-reports/e2e-browser',
  reports: ['raw', 'v8', 'console-details'],
  entryFilter: {
    '**/node_modules/**': false,
    '**/*': true,
  },
};
