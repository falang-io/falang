// Plain Node entry point: this file runs as its own process (spawned by `run-compile-job.ts` via
// `@falang/desktop-worker-process`), either straight from source through `tsx` in dev or bundled by
// `build-compile-worker.esbuild.ts` for a packaged build — see `resolve-compile-worker-command.ts`'s
// own doc comment for the dev/packaged split.
//
// This folder has its own `package.json` (`{ "type": "commonjs" }`), overriding the app's own
// `"type": "module"` for everything under it — needed so `tsx <this file>` in dev loads it (and every
// import below) through Node's CJS loader rather than its real ESM loader. Without that, both imports
// below throw `SyntaxError: ... does not provide an export named '...'`: `@falang/desktop-worker-process`
// is a workspace package whose `main` points straight at a raw `.ts` barrel (real ESM `export` syntax,
// not transpiled CJS), and `../arduino-compiler/compile-arduino-project.js` itself (a local, ordinary
// ESM-typed file, same as its own real neighbour `arduino-build.ts`) transitively imports
// `@falang/logic-constructor`/`@falang/debug`, which have the identical shape. Node's built-in
// `cjs-module-lexer` (used to statically find a CommonJS module's named exports for ESM `import {
// name } from '...'` support) can't parse that syntax at all and silently finds nothing — but every
// *other* consumer in this app resolves the same modules fine (Vite/Rollup's own CJS interop, used by
// every `main`/renderer import site including `arduino-build.ts`'s own import of this same
// `compile-arduino-project.js`, and esbuild's own bundler, used for this file's packaged build below,
// don't have this limitation — only Node's own native ESM loader does). Confirmed the hard way — see
// ADR 0020 (private)'s "Implementation notes (compile worker …)" for the full writeup, including why
// a *local* file (not just a workspace package) needed this too, unlike `app-sketch`'s own export
// worker (ADR 0019 (private)), which only ever imports workspace packages directly.
import { runWorkerMain } from '@falang/desktop-worker-process';
import { compileArduinoProject } from '../arduino-compiler/compile-arduino-project.js';
import type { ICompileWorkerJob, TCompileWorkerResult } from '../../shared/compile-worker-protocol.js';

// oxlint-disable-next-line require-await -- `runWorkerMain`'s handler type is `Promise<TResult>`; the compile itself is synchronous (that's the whole reason it's isolated in this process), no `await` needed inside.
runWorkerMain<ICompileWorkerJob, never, TCompileWorkerResult>(async (job) => {
  try {
    const result = compileArduinoProject({ documents: job.documents, drivers: job.drivers, debug: job.debug });
    return { ok: true, ...result, usedDriverIds: [...result.usedDriverIds] };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
});
