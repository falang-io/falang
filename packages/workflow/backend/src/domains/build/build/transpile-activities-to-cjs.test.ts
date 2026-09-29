import Module from 'node:module';
import { dirname, join } from 'node:path';
import { compileActivities } from '@falang/workflow-compiler';
import { describe, expect, it } from 'vitest';
import { transpileActivitiesToCjs } from './transpile-activities-to-cjs.js';

/** Loads CJS source from a string via `Module._compile` — the same technique a runner pod's
 * in-memory loader will use in production (see ADR 0016 (private)'s
 * "Artifact delivery into the runner pod"); reproduced locally here just to prove
 * `transpileActivitiesToCjs`'s output actually works when loaded that way, not to duplicate that
 * production loader (which belongs to `@falang/workflow-runner`, not `backend`). */
const loadCjsFromSource = (source: string, filename: string): NodeModule => {
  const requireModule = Module as unknown as {
    new (id: string): NodeModule;
    _nodeModulePaths(from: string): string[];
  };
  const mod = new requireModule(filename);
  mod.filename = filename;
  mod.paths = requireModule._nodeModulePaths(dirname(filename));
  (mod as unknown as { _compile(code: string, filename: string): unknown })._compile(source, filename);
  return mod;
};

describe('transpileActivitiesToCjs', () => {
  it('strips TypeScript syntax down to plain CommonJS', () => {
    const source = "export const greet = (name: string): string => `hi ${name}`;\n";
    const cjs = transpileActivitiesToCjs(source);

    expect(cjs).toContain('exports.greet');
    expect(cjs).not.toContain(': string');
    expect(cjs).not.toMatch(/^export /m);
  });

  it('converts an ESM import into a require() the CJS module loader can resolve', () => {
    const source = "import { join } from 'node:path';\nexport const full = (a: string, b: string): string => join(a, b);\n";
    const cjs = transpileActivitiesToCjs(source);

    expect(cjs).toContain("require(");
    expect(cjs).not.toMatch(/^import /m);
  });

  it('round-trips the real compiled activities module: loads via Module._compile and exposes working exports', () => {
    const activitiesSource = compileActivities();
    const cjs = transpileActivitiesToCjs(activitiesSource);

    // Filename only needs to be a plausible path inside this repo's node_modules-resolvable tree —
    // never actually read from disk — so `require('@temporalio/activity')` inside the compiled
    // activities resolves the same way it will for a runner pod's in-memory loader.
    // oxlint-disable-next-line unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
    const filename = join(__dirname, '__test-activities__.js');
    const mod = loadCjsFromSource(cjs, filename);

    expect(typeof mod.exports.logActivity).toBe('function');
    expect(typeof mod.exports.runActivepiecesAction).toBe('function');
  });
});
