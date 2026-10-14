import * as esbuild from 'esbuild';
import { copyTypescriptLibs } from '../../../scripts/release/copy-typescript-libs.js';

/**
 * Bundles the sketch-compile worker (`src/main/compile-worker/worker-main.ts`) into one
 * self-contained `worker-dist/index.js` — the packaged-build shape
 * `resolve-compile-worker-command.ts` expects (`node <resourcesPath>/compile-worker/index.js`, no
 * `node_modules` shipped alongside it), copied there by `electron-builder.yml`'s `extraResources`.
 * Same shape as `@falang/desktop-mcp`'s own `build.esbuild.ts` and `app-sketch`'s own
 * `build-export-worker.esbuild.ts` — CJS output, no `external` beyond Node's own builtins and the
 * lazily loaded `@serialport/*` (see below), run before `electron-builder` via this package's own
 * `prebuild:*` npm hooks (not part of `out/`, electron-vite's own build output). Deliberately *not* under `dist/`: this package's own `electron-builder.yml` sets
 * `directories.output: dist` for the final packaged installers — `worker-dist` avoids that collision
 * and gets its own bare entry in the repo root `.gitignore`, same treatment as `dist`/`out`.
 */
const run = async (): Promise<void> => {
  await esbuild.build({
    bundle: true,
    entryPoints: ['src/main/compile-worker/worker-main.ts'],
    format: 'cjs',
    logLevel: 'info',
    // The serial port packages are loaded lazily by `@falang/desktop-arduino-cli`'s `monitorPort`, which
    // this bundle never calls; bundling them would only drag in a native addon it can't load.
    external: ['@serialport/*'],
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
