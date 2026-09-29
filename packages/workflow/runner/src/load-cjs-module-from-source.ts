// oxlint-disable-next-line unicorn/prefer-module -- this package is CommonJS (package.json "type"); the `Module` API below is CJS-only, not an ESM concern.
import Module from 'node:module';
import { dirname } from 'node:path';

interface INodeModuleInternals {
  new (id: string): NodeModule;
  _nodeModulePaths(from: string): string[];
}

interface ICompilableModule extends NodeModule {
  _compile(code: string, filename: string): unknown;
}

/**
 * Loads a CommonJS module from source text without ever writing it to disk — see
 * ADR 0016 (private)'s "Artifact delivery into the runner pod": the
 * runner pod fetches its compiled activities module over HTTP and must execute it with
 * `readOnlyRootFilesystem: true`, so there's no writable path to `import()`/`require()` from the
 * way `start-runner.ts` used to. `filename` only needs to be a plausible absolute path — used to
 * compute `.paths` (so `require('@temporalio/activity')` inside the loaded module resolves the same
 * way it would for a real file at that location, against the runner image's own pre-baked
 * `node_modules`) and to attribute stack traces — it's never actually read from disk.
 */
export const loadCjsModuleFromSource = (source: string, filename: string): unknown => {
  const ModuleCtor = Module as unknown as INodeModuleInternals;
  const mod = new ModuleCtor(filename) as ICompilableModule;
  mod.filename = filename;
  mod.paths = ModuleCtor._nodeModulePaths(dirname(filename));
  mod._compile(source, filename);
  return mod.exports;
};
