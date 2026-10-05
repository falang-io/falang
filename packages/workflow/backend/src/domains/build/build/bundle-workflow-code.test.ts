import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertIsolatedModuleCache, bundleWorkflowCode, includeBuildDirInTsRule } from './bundle-workflow-code.js';

// Webpack cold-start (module graph resolution across the repo's node_modules tree) can exceed
// vitest's default 5s timeout — same reasoning as `type-check-project.test.ts`'s bump.
vi.setConfig({ testTimeout: 20_000 });

// Must live inside this repo's node_modules-resolvable tree (walking up from here finds a real
// `node_modules` with `@temporalio/workflow` hoisted into it) — an OS temp dir fails, see
// ADR 0002 (private). `.builds/` is the same gitignored dir
// `BuildService` itself writes compiled artifacts to.
// oxlint-disable-next-line unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
const TEST_DIR = join(__dirname, '..', '..', '..', '..', '.builds', 'bundle-workflow-code.test');
const WORKFLOWS_PATH = join(TEST_DIR, 'workflows.ts');

describe('bundleWorkflowCode', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(
      WORKFLOWS_PATH,
      "export const myTestWorkflow = async (): Promise<string> => 'ok';\n",
      'utf8',
    );
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('bundles a compiled workflows module into a single self-contained code string', async () => {
    const code = await bundleWorkflowCode(WORKFLOWS_PATH);

    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
    // The exported workflow function's name survives webpack bundling unminified — this is what a
    // runner pod's `Worker.create({ workflowBundle: { code } })` discovers workflows by.
    expect(code).toContain('myTestWorkflow');
  });

  it("keeps Temporal's per-execution module cache, so executions never share module-level state", async () => {
    const code = await bundleWorkflowCode(WORKFLOWS_PATH);

    expect(code).toContain('var __webpack_module_cache__ = globalThis.__webpack_module_cache__');
    expect(code).not.toContain('const __webpack_module_cache__ = {}');
  });

  // The cloud image installs the backend as a dependency (`/app/node_modules/@falang/workflow-backend`),
  // so its build directory sits under `node_modules`, where Temporal's swc rule doesn't apply — every
  // prod build failed with "Module parse failed" until `includeBuildDirInTsRule` (found 2026-10-05).
  it('compiles TypeScript in a build directory that lives under node_modules', async () => {
    const dir = join(TEST_DIR, 'node_modules', '@falang', 'workflow-backend', '.builds', 'b-1');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'workflows.ts');
    writeFileSync(path, "export const nestedWorkflow = async (n: number): Promise<string> => `ok ${n as number}`;\n", 'utf8');

    const code = await bundleWorkflowCode(path);

    expect(code).toContain('nestedWorkflow');
  });

  it("includes webpack's own error output in the thrown error", async () => {
    const dir = join(TEST_DIR, 'broken');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'workflows.ts');
    writeFileSync(path, "import { missing } from './does-not-exist';\nexport const w = async () => missing;\n", 'utf8');

    await expect(bundleWorkflowCode(path)).rejects.toThrow(/does-not-exist/);
  });

  it('includeBuildDirInTsRule leaves other node_modules files excluded', () => {
    const config = includeBuildDirInTsRule(
      { module: { rules: [{ test: /\.ts$/, exclude: /node_modules/ }, { test: /\.js$/ }] } },
      '/app/node_modules/@falang/workflow-backend/.builds/b-1',
    );
    const [tsRule, jsRule] = config.module?.rules ?? [];
    const exclude = (tsRule as { exclude: (path: string) => boolean }).exclude;

    expect(exclude('/app/node_modules/@falang/workflow-backend/.builds/b-1/workflows.ts')).toBe(false);
    expect(exclude('/app/node_modules/@falang/workflow-backend/.builds/b-10/workflows.ts')).toBe(true);
    expect(exclude('/app/node_modules/@temporalio/workflow/src/index.ts')).toBe(true);
    expect(exclude('/app/src/workflows.ts')).toBe(false);
    expect(jsRule).toEqual({ test: /\.js$/ });
  });

  it('assertIsolatedModuleCache rejects a bundle whose module cache is a plain shared object', () => {
    expect(() => assertIsolatedModuleCache('const __webpack_module_cache__ = {};')).toThrow(/share module state/);
  });
});
