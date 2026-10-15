// Vitest config for `npm run coverage:logic`: the docker-based `@falang/logic-e2e-tests` suite with the
// same coverage provider as the unit run, raw `mcr` output in `coverage/logic/raw` (merged by
// `scripts/merge-coverage.mjs` when present). Sets `root` itself: a `--root` on the command line would make Vitest
// resolve `-c` against it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(repoRoot, 'coverage/logic');

export default {
  root: path.join(repoRoot, 'packages/logic/e2e-tests'),
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/temp/**', '**/.stryker-tmp/**'],
    testTimeout: 30_000,
    coverage: {
      reportOnFailure: true,
      reportsDirectory: outputDir,
      provider: 'custom',
      customProviderModule: path.join(repoRoot, 'scripts/vitest-coverage-provider.mjs'),
      coverageReportOptions: {
        name: 'Logic e2e Coverage Report',
        outputDir,
        reports: ['raw', 'v8', 'console-details'],
        entryFilter: { '**/node_modules/**': false, '**/*': true },
      },
    },
  },
};
