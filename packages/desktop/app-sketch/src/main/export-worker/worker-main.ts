// Plain Node entry point, deliberately importing nothing from `electron`: this file runs as its own
// process (spawned by `run-export-job.ts` via `@falang/desktop-worker-process`), either straight from
// source through `tsx` in dev or bundled by `build-export-worker.esbuild.ts` for a packaged build —
// see `resolve-export-worker-command.ts`'s own doc comment for the dev/packaged split.
//
// This folder has its own `package.json` (`{ "type": "commonjs" }`), overriding the app's own
// `"type": "module"` for everything under it — needed so `tsx <this file>` in dev loads it (and every
// import below) through Node's CJS loader rather than its real ESM loader. Without that: each of
// `@falang/desktop-worker-process`/`@falang/logic-export`/`@falang/simple-code-export`'s `main` points
// straight at a raw `.ts` barrel (`export * from './x.js'; export * from './y.js';` — real ESM
// `export` syntax, not transpiled CJS), and Node's built-in `cjs-module-lexer` (used to statically find
// a CommonJS module's named exports for ESM `import { name } from '...'` support) cannot parse that
// syntax at all — it silently finds nothing, so a plain `import { exportLogicProject } from
// '@falang/logic-export'` throws `SyntaxError: ... does not provide an export named
// 'exportLogicProject'` even though every *other* consumer in this repo resolves the same module fine
// (Vite/Rollup's own CJS interop, used by every `main`/renderer import site, and esbuild's own bundler,
// used for this file's packaged build below, don't have this limitation — only Node's own native ESM
// loader does). Confirmed the hard way — see ADR 0019 (private)'s "Implementation notes (export
// worker …)" for the full writeup, including why the fix is this folder's `package.json` rather than
// `createRequire` (the latter also works in dev, but defeats esbuild's static bundling for the
// packaged build, which needs these to stay plain `import`s to end up inlined).
import { runWorkerMain } from '@falang/desktop-worker-process';
import { exportLogicProject } from '@falang/logic-export';
import { exportCodeProject } from '@falang/simple-code-export';
import type {
  IExportWorkerProgress,
  TExportWorkerJob,
  TExportWorkerResult,
} from '../../shared/export-worker-protocol.js';

runWorkerMain<TExportWorkerJob, IExportWorkerProgress, TExportWorkerResult>(async (job, report) => {
  if (job.kind === 'logic') {
    const result = await exportLogicProject({
      projectDir: job.dir,
      documents: job.documents,
      exports: job.exports,
      onProgress: (progress) =>
        report({ done: progress.done, total: progress.total, label: `${progress.language} → ${progress.path}` }),
    });
    return { kind: 'logic', result };
  }
  const result = await exportCodeProject({
    projectDir: job.dir,
    documents: job.documents,
    onProgress: (progress) => report({ done: progress.done, total: progress.total, label: progress.documentName }),
  });
  return { kind: 'code', result };
});
