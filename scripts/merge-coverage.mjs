// Merges unit test coverage (Vitest, via `vitest-monocart-coverage` — see
// `vitest.config.root.ts`/`mcr.config.unit.mjs`) with e2e coverage (Playwright browser +
// `backend`/`runner` Node processes — see `docker-compose.workflow-e2e.yml` and
// ADR 0012 (private)) into one combined report.
//
// Run after `npm run coverage:unit` and `npm run coverage:e2e` (docker-based) have both
// produced their raw coverage output — see the root `coverage` script.
import fs from 'node:fs';
import path from 'node:path';
import { CoverageReport } from 'monocart-coverage-reports';

const INPUT_DIRS = ['./coverage/unit/raw', './coverage/e2e-browser/raw'];
const NODE_DATA_DIR = './coverage/e2e-node';

// Node writes its own `NODE_V8_COVERAGE` files with mode 600, and the e2e containers run as root,
// so without `scripts/coverage-e2e-dirs.sh finalize` (part of `npm run coverage:e2e`) part of the
// input is unreadable — and `mcr` skips such files with a log line instead of failing, which once
// silently dropped every build-worker file from the report. Refuse to produce a partial report.
const assertReadable = (dir) => {
  if (!fs.existsSync(dir)) {
    throw new Error(`merge-coverage: ${dir} does not exist — run the coverage step that produces it first.`);
  }
  const unreadable = fs.readdirSync(dir).filter((name) => {
    try {
      fs.accessSync(path.join(dir, name), fs.constants.R_OK);
      return false;
    } catch {
      return true;
    }
  });
  if (unreadable.length > 0) {
    throw new Error(
      `merge-coverage: ${unreadable.length} file(s) in ${dir} are not readable (root-owned output of the e2e ` +
        `containers) — run \`scripts/coverage-e2e-dirs.sh finalize\` and merge again.`,
    );
  }
};
for (const dir of [...INPUT_DIRS, NODE_DATA_DIR]) assertReadable(dir);

// Optional inputs — `npm run coverage:services` (activepieces/, proxy/) and `npm run coverage:logic`
// (docker-based logic e2e). Merged only when their raw output exists.
const OPTIONAL_DIRS = [
  './coverage/services/proxy/raw',
  './coverage/services/activepieces/raw',
  './coverage/logic/raw',
].filter((dir) => fs.existsSync(dir));
for (const dir of OPTIONAL_DIRS) assertReadable(dir);
process.stdout.write(
  OPTIONAL_DIRS.length > 0
    ? `merge-coverage: optional inputs included: ${OPTIONAL_DIRS.join(', ')}\n`
    : 'merge-coverage: optional inputs included: none (coverage:services / coverage:logic not run)\n',
);

// `backend` writes its own file only if `SIGTERM` reaches the Node process and its shutdown hook
// finishes before compose's `SIGKILL` — a wrapper in between (`npm run`, `npx`) or a too-short
// `stop_grace_period` silently loses it, leaving only build-worker files (their own processes) and
// runner-pod files (`coverage-runner-*`, pushed over HTTP). That happened unnoticed twice, so check
// for a file that loaded `create-app.ts`, which only the `backend` process itself does.
const assertBackendProcessCoverage = () => {
  const ownFiles = fs.readdirSync(NODE_DATA_DIR).filter((name) => !name.startsWith('coverage-runner-'));
  if (ownFiles.length === 0) return;
  const found = ownFiles.some((name) =>
    fs.readFileSync(path.join(NODE_DATA_DIR, name), 'utf8').includes('/packages/workflow/backend/src/create-app.ts'),
  );
  if (!found) {
    throw new Error(
      `merge-coverage: ${NODE_DATA_DIR} has no coverage of the \`backend\` process itself — its SIGTERM shutdown ` +
        `hook didn't run to completion (see the \`backend\` service's \`command\`/\`stop_grace_period\` in ` +
        `docker-compose.workflow-e2e.yml).`,
    );
  }
};
assertBackendProcessCoverage();

// Inside the e2e containers the repo lives at `/app` (`WORKDIR /app` in every docker/*.Dockerfile),
// so `backend`/build workers report `/app/packages/...` and runner pods `file:///app/packages/...`
// (which `mcr` normalizes to `app/packages/...`); Vite serves workspace sources as
// `http://client:5175/@fs/app/packages/...` (normalized to `client-5175/@fs/app/packages/...`) and
// the client package's own sources root-relative (`client-5175/src/...`). Rebase all of them onto
// repo-relative paths so they line up with the unit run's entries for the same files.
const rebase = (filePath) =>
  filePath
    .replace(/^file:\/\//, '')
    .replace(/^.*?\/@fs\/app\//, '')
    .replace(/^client-\d+\/(src\/)/, 'packages/workflow/client/$1')
    .replace(/^\/?app\//, '');

const coverageOptions = {
  name: 'Combined Coverage Report',
  outputDir: './coverage/combined',

  // `mcr`'s own portable "raw" format, produced by both the unit run and the e2e browser run.
  inputDir: [...INPUT_DIRS, ...OPTIONAL_DIRS],
  // The literal `NODE_V8_COVERAGE` directory `backend`/`runner` wrote inside their container,
  // bind-mounted to this host path — loaded automatically by `generate()`, in addition to
  // `inputDir` above (see `mcr`'s own `readFromDir`/`addFromDir`, which parses Node's native
  // `coverage-<pid>-<ts>.json` shape directly, a different format from `inputDir`'s raw reports).
  dataDir: NODE_DATA_DIR,

  // Applies to `dataDir` only — `inputDir`'s raw reports were already filtered when they were
  // collected (`mcr.config.unit.mjs`, `packages/workflow/e2e-tests/mcr.config.e2e-browser.ts`).
  entryFilter: {
    '**/node_modules/**': false,
    '**/*': true,
  },
  // Sees paths already rewritten by `sourcePath` below (`mcr` applies it to every source-map source
  // before filtering).
  sourceFilter: {
    '**/node_modules/**': false,
    '**/src/**': true,
  },

  // Vite's source maps name only the file itself (`sources: ['auth-store.ts']`), so `mcr` hands a
  // bare file name here — the directory comes from `info.distFile`, the served module's own path.
  // Without this every browser-side module failed `sourceFilter` and the whole client coverage was
  // dropped from the combined report.
  sourcePath: (filePath, info) => {
    const distFile = typeof info?.distFile === 'string' ? info.distFile : null;
    const full =
      distFile && !filePath.includes('/') ? path.posix.join(path.posix.dirname(distFile), filePath) : filePath;
    return rebase(full);
  },

  reports: ['v8', 'console-details', 'lcovonly'],
};

await new CoverageReport(coverageOptions).generate();
