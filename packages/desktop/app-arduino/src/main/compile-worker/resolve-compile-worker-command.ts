import * as path from 'node:path';
import { app } from 'electron';
import type { IWorkerProcessCommand } from '@falang/desktop-worker-process';

/**
 * Resolves the command that runs `worker-main.ts` (this app's sketch-compile worker — see its own doc
 * comment and ADR 0020 (private)'s "Implementation notes (compile worker …)"). Same dev/packaged
 * split as `app-sketch`'s own `resolve-export-worker-command.ts` (see its doc comment for the full
 * reasoning), reusing the identical `import.meta.dirname` repo-root walk-up:
 *
 *  - **packaged build**: `node <resourcesPath>/compile-worker/index.js` — `build-compile-worker.esbuild.ts`
 *    bundles `worker-main.ts` into a single self-contained CJS file, copied there by
 *    `electron-builder.yml`'s `extraResources`. Requires a `node` on `PATH`, same assumption
 *    `resolveMcpServerCommand` already makes.
 *  - **dev**: the repo's own `node_modules/.bin/tsx` invoked directly against
 *    `<repoRoot>/packages/desktop/app-arduino/src/main/compile-worker/worker-main.ts`, no build step.
 *    Not `npx tsx`: `npx` interposes its own child-process wrapper that doesn't forward the `'ipc'`
 *    file descriptor `runInWorkerProcess`'s job/result protocol relies on, so the spawned tree runs
 *    and exits cleanly without the worker ever receiving its job — see `resolve-export-worker-command.ts`'s
 *    matching comment (same bug, found and fixed there first) for the live repro and the "same root
 *    cause as `docker/runner.Dockerfile`'s `CMD`/`npm run start`'s `SIGTERM` fix" reasoning.
 */
export const resolveCompileWorkerCommand = (): IWorkerProcessCommand => {
  if (app.isPackaged) {
    return { command: 'node', args: [path.join(process.resourcesPath, 'compile-worker', 'index.js')] };
  }
  // `import.meta.dirname` is always `<app>/out/main` at runtime regardless of which `src/main/**`
  // subfolder this file lives in — electron-vite bundles the whole `main` entry into one physical
  // `out/main/index.js` — 5-level walk-up: out/main → out → app-arduino → desktop → packages → repo root.
  const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
  return {
    command: path.join(repoRoot, 'node_modules/.bin/tsx'),
    args: [path.join(repoRoot, 'packages/desktop/app-arduino/src/main/compile-worker/worker-main.ts')],
  };
};
