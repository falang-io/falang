import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileRustProject } from '@falang/logic-constructor';
import {
  NUMBERS_EXPECTED_RESULT_LINES,
  NUMBERS_MAIN_DOCUMENT_ID,
  NUMBERS_PROJECT_DOCUMENTS,
} from './numbers-project.fixture.js';
import { buildNoApiRustDriver, runRustProjectInDocker, writeRustFalangProjectFiles } from './run-rust-project.js';

// Same generous budget as the cpp/Go pilot tests — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('numbers project (ADR 0069 (private))', () => {
  it(
    'compiles integer widths, promotion, division and float-to-integer stores and prints the same lines on this target',
    async () => {
      const compiled = compileRustProject({
        documents: NUMBERS_PROJECT_DOCUMENTS,
        entryDocumentId: NUMBERS_MAIN_DOCUMENT_ID,
      });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-numbers-rust-'));
      try {
        await writeRustFalangProjectFiles(dir, compiled, buildNoApiRustDriver());
        const lines = await runRustProjectInDocker(dir);
        expect(lines.slice(0, NUMBERS_EXPECTED_RESULT_LINES.length)).toEqual(NUMBERS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});
