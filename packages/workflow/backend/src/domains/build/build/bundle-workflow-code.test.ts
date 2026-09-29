import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bundleWorkflowCode } from './bundle-workflow-code.js';

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
});
