import * as path from 'node:path';
import { app } from 'electron';
import { electronNodeCommand, type IWorkerProcessCommand } from '@falang/desktop-worker-process';

/**
 * Resolves the command that runs `worker-main.ts` (this app's codegen worker — see its own doc
 * comment and ADR 0019 (private)'s "Implementation notes (export worker …)"). Same dev/packaged
 * split as `mcp-server-path.ts`'s `resolveMcpServerCommand` (see its doc comment for the full
 * reasoning), reusing the identical `import.meta.dirname` repo-root walk-up:
 *
 *  - **packaged build**: `<resourcesPath>/export-worker/index.js` run by the app's own binary in Node
 *    mode (`electronNodeCommand`, `ELECTRON_RUN_AS_NODE=1`) — never a `node` from `PATH`, which a
 *    typical Windows/macOS user doesn't have (ADR 0050 (private), "B1"). `build-export-worker.esbuild.ts`
 *    bundles `worker-main.ts` into a single self-contained CJS file, copied there by
 *    `electron-builder.yml`'s `extraResources`.
 *  - **dev**: the repo's own `node_modules/.bin/tsx` invoked directly against
 *    `<repoRoot>/packages/desktop/app-sketch/src/main/export-worker/worker-main.ts`, no build step.
 *    Not `npx tsx`: `npx` interposes its own child-process wrapper between this process and the real
 *    `tsx`-run Node process, and that wrapper does not forward the `'ipc'` file descriptor
 *    `runInWorkerProcess`'s job/result protocol relies on — confirmed live, a real export against a
 *    real project (`/home/serginho/Work/example-snake`) failed with "Worker process exited with code
 *    0" every time (the worker process tree ran and exited cleanly without ever receiving the job
 *    message, since nothing was keeping its event loop alive), and switching to the direct binary path
 *    fixed it. Same "no wrapper process in between" bug/fix shape as
 *    `docker/runner.Dockerfile`'s `CMD` (see its own comment) and `npm run start`'s `SIGTERM`-forwarding
 *    fix in ADR 0012 (private) — there it was signal forwarding, here it's
 *    IPC forwarding, same root cause.
 */
export const resolveExportWorkerCommand = (): IWorkerProcessCommand => {
  if (app.isPackaged) {
    return electronNodeCommand(path.join(process.resourcesPath, 'export-worker', 'index.js'));
  }
  // `import.meta.dirname` is always `<app>/out/main` at runtime regardless of which `src/main/**`
  // subfolder this file lives in — electron-vite bundles the whole `main` entry into one physical
  // `out/main/index.js` — so this is the exact same 5-level walk-up `mcp-server-path.ts` uses:
  // out/main → out → app-sketch → desktop → packages → repo root.
  const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
  return {
    command: path.join(repoRoot, 'node_modules/.bin/tsx'),
    args: [path.join(repoRoot, 'packages/desktop/app-sketch/src/main/export-worker/worker-main.ts')],
  };
};
