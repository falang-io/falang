import MCR from 'monocart-coverage-reports';
import coverageOptions from './mcr.config.e2e-browser.js';

/**
 * Generates the browser-side coverage report from every `collectCoverage` fixture's `mcr.add()`
 * call across the whole run (see `tests/fixtures.ts` and ADR 0012 (private)).
 * A no-op when `COLLECT_COVERAGE` wasn't set — `mcr.generate()` on an empty cache just logs and
 * returns.
 */
export default async function globalTeardown(): Promise<void> {
  if (process.env.COLLECT_COVERAGE !== 'true') return;
  await MCR(coverageOptions).generate();
}
