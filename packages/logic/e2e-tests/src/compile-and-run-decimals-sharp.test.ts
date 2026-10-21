import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSharpProject } from '@falang/logic-constructor';
import {
  DECIMALS_EXPECTED_RESULT_LINES,
  DECIMALS_MAIN_DOCUMENT_ID,
  DECIMALS_PROJECT_DOCUMENTS,
} from './decimals-project.fixture.js';
import { runSharpProjectInDocker, writeSharpProjectFiles } from './run-sharp-project.js';

// Same generous budget as the cpp/Go/Rust versions — covers a cold image build on a standalone run.
const DOCKER_BUILD_TIMEOUT_MS = 600_000;

describe('decimals project (ADR 0069 (private) §4)', () => {
  it(
    'compiles exact decimal arithmetic, rounding, stores and printing and prints the same lines on this target',
    async () => {
      const code = compileSharpProject({
        documents: DECIMALS_PROJECT_DOCUMENTS,
        entryDocumentId: DECIMALS_MAIN_DOCUMENT_ID,
      });

      const dir = await mkdtemp(join(tmpdir(), 'falang-logic-decimals-sharp-'));
      try {
        await writeSharpProjectFiles(dir, code);
        const lines = await runSharpProjectInDocker(dir);
        expect(lines.slice(0, DECIMALS_EXPECTED_RESULT_LINES.length)).toEqual(DECIMALS_EXPECTED_RESULT_LINES);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    DOCKER_BUILD_TIMEOUT_MS,
  );
});
