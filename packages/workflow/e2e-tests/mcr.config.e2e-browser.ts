// Coverage options for the browser (client) side of the e2e suite — collected via Playwright's
// Chromium CDP `page.coverage` API (see `tests/fixtures.ts`'s `collectCoverage` fixture) and
// merged with unit + backend/runner coverage by the root `scripts/merge-coverage.mjs`. See
// ADR 0012 (private).
export default {
  name: 'E2E Browser Coverage Report',
  outputDir: './coverage-reports/e2e-browser',
  reports: ['raw', 'v8', 'console-details'],
  // Only modules under some `src/` — anything else is Vite's own client, React refresh or an HTML
  // page's inline script, which would land in the combined report as junk entries such as
  // `client-5175/admin` (no source map, so the merge's `sourceFilter` never sees them).
  entryFilter: {
    '**/node_modules/**': false,
    '**/src/**': true,
    '**/*': false,
  },
};
