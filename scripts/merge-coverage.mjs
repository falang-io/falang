// Merges unit test coverage (Vitest, via `vitest-monocart-coverage` — see
// `vitest.config.root.ts`/`mcr.config.unit.mjs`) with e2e coverage (Playwright browser +
// `backend`/`runner` Node processes — see `docker-compose.workflow-e2e.yml` and
// ADR 0012 (private)) into one combined report.
//
// Run after `npm run coverage:unit` and `npm run coverage:e2e` (docker-based) have both
// produced their raw coverage output — see the root `coverage` script.
import { CoverageReport } from 'monocart-coverage-reports';

const CONTAINER_APP_PREFIX = '/app/';

const coverageOptions = {
  name: 'Combined Coverage Report',
  outputDir: './coverage/combined',

  // `mcr`'s own portable "raw" format, produced by both the unit run and the e2e browser run.
  inputDir: ['./coverage/unit/raw', './coverage/e2e-browser/raw'],
  // The literal `NODE_V8_COVERAGE` directory `backend`/`runner` wrote inside their container,
  // bind-mounted to this host path — loaded automatically by `generate()`, in addition to
  // `inputDir` above (see `mcr`'s own `readFromDir`/`addFromDir`, which parses Node's native
  // `coverage-<pid>-<ts>.json` shape directly, a different format from `inputDir`'s raw reports).
  dataDir: './coverage/e2e-node',

  entryFilter: {
    '**/node_modules/**': false,
    '**/*': true,
  },
  sourceFilter: {
    '**/node_modules/**': false,
    '**/src/**': true,
  },

  // `backend`/`runner` ran from `/app/...` inside their container (see docker/backend.Dockerfile's
  // `WORKDIR /app`) while this script runs on the host from the repo root — rebase those entries
  // onto real files on disk. The browser side needs no rewriting: Vite serves `client`'s modules
  // under root-relative URLs that already map 1:1 onto `packages/workflow/client/src/...`.
  sourcePath: (filePath) =>
    filePath.startsWith(CONTAINER_APP_PREFIX) ? filePath.slice(CONTAINER_APP_PREFIX.length) : filePath,

  reports: ['v8', 'console-details', 'lcovonly'],
};

await new CoverageReport(coverageOptions).generate();
