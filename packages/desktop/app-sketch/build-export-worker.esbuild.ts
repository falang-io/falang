import * as esbuild from 'esbuild';
import { copyTypescriptLibs } from '../../../scripts/release/copy-typescript-libs.js';

/**
 * Bundles the codegen export worker (`src/main/export-worker/worker-main.ts`) into one self-contained
 * `worker-dist/index.js` — the packaged-build shape `resolve-export-worker-command.ts` expects
 * (`node <resourcesPath>/export-worker/index.js`, no `node_modules` shipped alongside it), copied there
 * by `electron-builder.yml`'s `extraResources`. Same shape as `@falang/desktop-mcp`'s own
 * `build.esbuild.ts` (see its own doc comment) — CJS output, no `external` beyond Node's own builtins,
 * run before `electron-builder` via this package's own `prebuild:*` npm hooks (not part of `out/`,
 * electron-vite's own build output). Deliberately *not* under `dist/`: this package's own
 * `electron-builder.yml` sets `directories.output: dist` for the final packaged installers — writing
 * the worker bundle there too risked electron-builder's own output tracking colliding with it
 * (`worker-dist` gets its own bare entry in the repo root `.gitignore`, same treatment as `dist`/`out`).
 */
// Top-level `await` would need this script itself to run as an ES module — this package's own
// `package.json` `"type": "module"` would actually allow that, but a plain async function + `.catch()`
// keeps this file identical in shape to `@falang/desktop-mcp`'s own build script.
const run = async (): Promise<void> => {
  await esbuild.build({
    bundle: true,
    entryPoints: ['src/main/export-worker/worker-main.ts'],
    format: 'cjs',
    logLevel: 'info',
    outfile: 'worker-dist/index.js',
    platform: 'node',
    target: 'node24',
  });
  // The TypeScript lib files must sit next to the bundle (see `copy-typescript-libs.ts`).
  await copyTypescriptLibs('worker-dist');
};

run().catch((error: unknown) => {
  // oxlint-disable-next-line no-console -- a build script, not the worker itself; stdout/stderr have no wire-protocol meaning here.
  console.error(error);
  process.exitCode = 1;
});
