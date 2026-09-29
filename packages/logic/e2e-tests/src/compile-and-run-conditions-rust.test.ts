import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileRustProject } from '@falang/logic-constructor';
import { CONDITIONS_PROJECT_DOCUMENTS, MAIN_DOCUMENT_ID } from './conditions-project.fixture.js';
import { buildNoApiRustDriver, runRustProjectInDocker, writeRustFalangProjectFiles } from './run-rust-project.js';
import { CONDITIONS_EXPECTED_RESULT_LINES } from './expected-output.js';

/**
 * Reuses the shared `conditions-project.fixture.ts` directly, no `*-rust.fixture.ts` fork needed — like
 * the Go migration of this same project, it's already language-agnostic (only `int32`, never mixes
 * numeric types), so nothing here hits the int32/float32 coercion gap `objects-project-rust.fixture.ts`
 * had to work around.
 */

describe('conditions project on the Rust target (ADR 0019 (private))', () => {
  it("compiles multi-level break/continue through nested switches on a real project and reproduces the old app's result.txt via the Docker build&run harness", async () => {
    const compiled = compileRustProject({ documents: CONDITIONS_PROJECT_DOCUMENTS, entryDocumentId: MAIN_DOCUMENT_ID });

    const dir = await mkdtemp(join(tmpdir(), 'falang-logic-conditions-rust-'));
    try {
      await writeRustFalangProjectFiles(dir, compiled, buildNoApiRustDriver());
      const lines = await runRustProjectInDocker(dir);
      expect(lines.slice(0, CONDITIONS_EXPECTED_RESULT_LINES.length)).toEqual(CONDITIONS_EXPECTED_RESULT_LINES);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 600_000);
});
