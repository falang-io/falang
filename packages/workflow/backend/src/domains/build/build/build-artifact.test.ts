// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildArtifact, typeCheckInWorker } from './build-artifact.js';

// A real child process, a real ts.Program and a real webpack run.
vi.setConfig({ testTimeout: 120_000 });

// Inside the repo's node_modules-resolvable tree (see ADR 0002 (private)), same as `.builds/`.
const OUTPUT_DIR = join(__dirname, '..', '..', '..', '..', '.builds', 'build-artifact.test');

const VALID_WORKFLOWS = "export async function run(): Promise<string> {\n  return 'ok';\n}\n";
const VALID_ACTIVITIES = "export const hello = (name: string): string => `hi ${name}`;\n";

describe('buildArtifact', () => {
  beforeAll(() => mkdirSync(OUTPUT_DIR, { recursive: true }));
  afterAll(() => rmSync(OUTPUT_DIR, { recursive: true, force: true }));

  it('builds the artifact in a per-build directory that is gone afterwards', async () => {
    const artifact = await buildArtifact(OUTPUT_DIR, VALID_WORKFLOWS, VALID_ACTIVITIES);

    expect(artifact.workflowBundle).toContain('run');
    expect(artifact.activitiesSource).toContain('exports.hello');
    expect(readdirSync(OUTPUT_DIR)).toEqual([]);
  });

  it('removes the per-build directory when the build fails', async () => {
    await expect(buildArtifact(OUTPUT_DIR, 'export const x: number = "not a number";', VALID_ACTIVITIES)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(readdirSync(OUTPUT_DIR)).toEqual([]);
  });

  it('removes the per-build directory when the build process dies', async () => {
    await expect(
      buildArtifact(OUTPUT_DIR, VALID_WORKFLOWS, VALID_ACTIVITIES, { timeoutMs: 1 }),
    ).rejects.toThrow();
    expect(readdirSync(OUTPUT_DIR)).toEqual([]);
  });

  it('refuses generated code that tries to load another build’s files, without bundling anything', async () => {
    const hostile = "import { s } from '../other-build/workflows';\nexport async function run(): Promise<string> { return s; }\n";
    const failure = await buildArtifact(OUTPUT_DIR, hostile, VALID_ACTIVITIES).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify((failure as BadRequestException).getResponse())).toContain('is not allowed in generated code');
    expect(existsSync(join(OUTPUT_DIR, '..', 'other-build'))).toBe(false);
    expect(readdirSync(OUTPUT_DIR)).toEqual([]);
  });
});

describe('typeCheckInWorker', () => {
  it('resolves for valid code and throws the 400 shape for broken code', async () => {
    await expect(typeCheckInWorker(VALID_WORKFLOWS, VALID_ACTIVITIES)).resolves.toBeUndefined();
    await expect(typeCheckInWorker('export const x: number = "s";', VALID_ACTIVITIES)).rejects.toBeInstanceOf(BadRequestException);
  });
});
