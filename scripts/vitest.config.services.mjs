// Vitest config for the standalone services outside the npm workspace (`activepieces/`, `proxy/`),
// used only by `scripts/coverage-services.sh`. The services' own lockfiles carry no coverage
// provider, so the root's `vitest-monocart-coverage` wrapper is borrowed through an absolute path;
// raw `mcr` output lands in `coverage/services/<service>/raw`, where `scripts/merge-coverage.mjs`
// picks it up. `SERVICE_NAME` is the directory name (`proxy` | `activepieces`).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = process.env.SERVICE_NAME;
if (!service) throw new Error('vitest.config.services: SERVICE_NAME is not set');

export default {
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    clearMocks: true,
    coverage: {
      reportOnFailure: true,
      reportsDirectory: path.join(repoRoot, 'coverage/services', service),
      provider: 'custom',
      customProviderModule: path.join(repoRoot, 'scripts/vitest-coverage-provider.mjs'),
      coverageReportOptions: {
        name: `${service} Coverage Report`,
        outputDir: path.join(repoRoot, 'coverage/services', service),
        reports: ['raw', 'console-details'],
        entryFilter: { '**/node_modules/**': false, '**/*': true },
        sourceFilter: { '**/node_modules/**': false, '**/src/**': true },
        // Vitest runs with cwd = the service, so `mcr` reports `src/x.ts`; the merged report needs repo paths.
        sourcePath: (filePath) => (filePath.startsWith(`${service}/`) ? filePath : `${service}/${filePath}`),
      },
    },
  },
};
